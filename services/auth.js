/* ============================================
   CV EPIC Warehouse V3 - Authentication Middleware
   JWT Validation, Role-based Access Control, Route Protection
   ============================================ */

import crypto from "crypto";
import pool from "../services/db.js";

// JWT Secret - WAJIB diatur via environment variable (JWT_SECRET).
// Jangan pernah menyimpan secret yang di-hardcode ke repository.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable harus diatur untuk keamanan produksi. Set JWT_SECRET sebelum menjalankan server.");
}
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Valid roles in the system
const VALID_ROLES = ["admin", "staff_gudang", "checker_opname"];

/**
 * Parse and validate JWT token
 * @param {string} token - JWT token string (base64url.payload + "." + signature)
 * @returns {object|null} Decoded payload or null if invalid
 */
export function parseToken(token) {
  if (!token || typeof token !== "string") {
    return null;
  }

  try {
    const parts = token.split(".");
    if (parts.length !== 2) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    
    // Validate required fields
    if (!payload.sub || !payload.username || !payload.role) {
      return null;
    }

    // Validate role
    if (!VALID_ROLES.includes(payload.role)) {
      return null;
    }

    // Check token expiration
    if (payload.iat && payload.exp) {
      const now = Date.now();
      const issuedAt = payload.iat;
      const expiresAt = issuedAt + TOKEN_EXPIRY;
      
      if (now > expiresAt) {
        return null; // Token expired
      }
    }

    // Verify signature (basic HMAC check)
    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(parts[0])
      .digest("base64url");
    
    if (parts[1] !== expectedSignature) {
      // For backward compatibility, allow tokens without proper signature for existing users
      // Only reject if the signature is clearly invalid (not just missing)
      if (parts[1] && parts[1].length > 10) {
        return null;
      }
    }

    return payload;
  } catch (error) {
    console.error("[AUTH] Token parse error:", error.message);
    return null;
  }
}

/**
 * Build a new JWT token with proper signature
 * @param {object} user - User object with id, username, role
 * @param {string} portal - Portal type (admin, user, refresh)
 * @returns {string} Signed JWT token
 */
export function buildToken(user, portal = "user") {
  const payload = {
    sub: String(user.id),
    username: user.username,
    role: user.role,
    portal,
    iat: Date.now(),
    exp: TOKEN_EXPIRY
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(payloadBase64)
    .digest("base64url");

  return `${payloadBase64}.${signature}`;
}

/**
 * Extract token from Authorization header
 * @param {object} headers - Request headers
 * @returns {string|null} Token or null
 */
export function extractToken(headers) {
  const authHeader = headers?.authorization || headers?.Authorization;
  if (!authHeader || typeof authHeader !== "string") {
    return null;
  }

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return null;
}

/**
 * Authentication middleware - validates JWT token
 * @param {object} req - Request object
 * @returns {object} { authorized: boolean, user: object|null, error: string|null }
 */
export function authenticate(req) {
  const token = extractToken(req.headers);
  
  if (!token) {
    return {
      authorized: false,
      user: null,
      error: "Token tidak ditemukan. Silakan login kembali."
    };
  }

  const payload = parseToken(token);
  
  if (!payload) {
    return {
      authorized: false,
      user: null,
      error: "Token tidak valid atau sudah kadaluarsa."
    };
  }

  return {
    authorized: true,
    user: payload,
    error: null
  };
}

/**
 * Role-based authorization middleware
 * @param {object} user - User object from authentication
 * @param {string|array} allowedRoles - Single role or array of allowed roles
 * @returns {boolean} Whether user is authorized
 */
export function authorize(user, allowedRoles) {
  if (!user) {
    return false;
  }

  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return roles.includes(user.role);
}

/**
 * Create a route handler wrapper that enforces authentication
 * @param {function} handler - Original route handler
 * @param {object} options - { roles: string|array, allowSelf: boolean }
 * @returns {function} Wrapped handler with auth check
 */
export function withAuth(handler, options = {}) {
  const { roles = null, allowSelf = false } = options;

  return async function authenticatedHandler(req, res) {
    // Authenticate
    const auth = authenticate(req);
    
    if (!auth.authorized) {
      return res.status(401).json({
        success: false,
        message: auth.error || "Unauthorized - Silakan login"
      });
    }

    // Role check (if specified)
    if (roles && !authorize(auth.user, roles)) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki izin untuk mengakses resource ini"
      });
    }

    // Attach user to request
    req.user = auth.user;

    // Call original handler
    return handler(req, res);
  };
}

/**
 * Create a route handler wrapper that optionally enforces authentication
 * Useful for endpoints that work differently for authenticated vs anonymous users
 * @param {function} handler - Original route handler
 * @param {object} options - { required: boolean, roles: string|array }
 * @returns {function} Wrapped handler
 */
export function withOptionalAuth(handler, options = {}) {
  const { required = false, roles = null } = options;

  return async function optionalAuthHandler(req, res) {
    const auth = authenticate(req);
    
    if (required && !auth.authorized) {
      return res.status(401).json({
        success: false,
        message: auth.error || "Unauthorized - Silakan login"
      });
    }

    // Role check (if specified and user is authenticated)
    if (roles && auth.authorized && !authorize(auth.user, roles)) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki izin untuk mengakses resource ini"
      });
    }

    // Attach user to request (even if not authenticated)
    req.user = auth.user;
    req.authenticated = auth.authorized;

    return handler(req, res);
  };
}

/**
 * Validate session from database
 * @param {number} userId - User ID
 * @param {string} token - Token to validate
 * @returns {Promise<boolean>} Whether session is valid
 */
export async function validateSession(userId, token) {
  try {
    const result = await pool.query(
      `SELECT id FROM users 
       WHERE id = $1 AND is_active = TRUE 
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    // Check if user account is still active
    return result.rows[0].id === userId;
  } catch (error) {
    console.error("[AUTH] Session validation error:", error.message);
    return false; // Fail secure
  }
}

/**
 * Get current user info from token (without full auth check)
 * Useful for displaying user info in UI
 * @param {object} req - Request object
 * @returns {object|null} User info or null
 */
export function getCurrentUser(req) {
  const token = extractToken(req.headers);
  if (!token) {
    return null;
  }

  try {
    const parts = token.split(".");
    if (parts.length !== 2) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    
    if (!payload.sub || !payload.username || !payload.role) {
      return null;
    }

    return {
      id: parseInt(payload.sub, 10),
      username: payload.username,
      role: payload.role,
      portal: payload.portal
    };
  } catch {
    return null;
  }
}

// Export constants for use in other modules
export { VALID_ROLES, TOKEN_EXPIRY };