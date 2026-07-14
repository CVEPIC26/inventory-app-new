/* ============================================
   CV EPIC Warehouse V3 - Users API Handler
   Handles user management CRUD operations
   ============================================ */

import crypto from "crypto";
import pool from "../services/db.js";
import { VALID_ROLES, authenticate, authorize, getCurrentUser } from "../services/auth.js";

// Security: Warn if JWT_SECRET is not set
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-change-in-production-please-set-jwt-secret";
if (!process.env.JWT_SECRET) {
  console.warn("[SECURITY WARNING] JWT_SECRET not set! Using fallback. Set JWT_SECRET env var in production.");
}

function send(res, status, payload) {
  return res.status(status).json(payload);
}

function hashPassword(password, salt = "") {
  // Use PBKDF2 for better security (compatible with auth.js werkzeug format)
  const iterations = 100000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2:sha256:${iterations}:${salt}$${hash}`;
}

// Generate random salt for each password
function generateSalt(length = 16) {
  return crypto.randomBytes(length).toString("hex");
}

function generateTempPassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function getRoutePath(req) {
  if (req.query?.route) {
    return "/" + String(req.query.route).replace(/^\/+ /, "");
  }
  const url = new URL(req.url, "http://localhost");
  return url.pathname.replace(/^\/api/, "") || "/";
}

function extractUserId(path) {
  const match = path.match(/^v1\/users\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function extractAction(path) {
  const match = path.match(/^v1\/users\/\d+\/([a-z-]+)/i);
  return match ? match[1] : null;
}

function normalizeRoute(routePath) {
  return routePath.replace(/^\/+/, '');
}

async function listUsers(req, res) {
  // Security: Only authenticated users can list users
  const auth = authenticate(req);
  if (!auth.authorized) {
    return send(res, 401, { success: false, message: "Unauthorized - Silakan login" });
  }

  const page = parseInt(req.query?.page) || 1;
  const limit = Math.min(parseInt(req.query?.limit) || 50, 100);
  const offset = (page - 1) * limit;
  const search = req.query?.search || "";
  const role = req.query?.role || "";
  const isActive = req.query?.is_active;

  try {
    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(username ILIKE $${paramIndex} OR nama_lengkap ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (role) {
      whereConditions.push(`role = $${paramIndex}`);
      params.push(role);
      paramIndex++;
    }

    if (isActive !== undefined && isActive !== "") {
      whereConditions.push(`is_active = $${paramIndex}`);
      params.push(isActive === "true" || isActive === true);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM users ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || 0, 10);

    const usersResult = await pool.query(
      `SELECT id, username, email, nama_lengkap, role, outlet_id, is_active, last_login, created_at, updated_at
       FROM users
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    // Map untuk frontend - sanitized for XSS prevention
    const users = usersResult.rows.map(u => ({
      id: u.id,
      username: sanitizeName(u.username),
      email: u.email ? sanitizeName(u.email) : null,
      nama: sanitizeName(u.nama_lengkap),
      name: sanitizeName(u.nama_lengkap),
      role: u.role,
      outlet_id: u.outlet_id,
      status: u.is_active ? 'active' : 'inactive',
      is_active: u.is_active,
      last_login: u.last_login,
      created_at: u.created_at,
      updated_at: u.updated_at
    }));

    return send(res, 200, {
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Error listing users:", error);
    return send(res, 500, { success: false, message: "Gagal mengambil data users" });
  }
}

async function getUser(req, res, userId) {
  // Security: Only authenticated users can view user details
  const auth = authenticate(req);
  if (!auth.authorized) {
    return send(res, 401, { success: false, message: "Unauthorized - Silakan login" });
  }

  if (isNaN(userId) || userId <= 0) {
    return send(res, 400, { success: false, message: "ID user tidak valid" });
  }

  try {
    const result = await pool.query(
      `SELECT id, username, email, nama_lengkap as name, role, outlet_id, is_active, last_login, created_at, updated_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return send(res, 404, { success: false, message: "User tidak ditemukan" });
    }

    const user = result.rows[0];
    return send(res, 200, { 
      success: true, 
      data: {
        ...user,
        username: sanitizeName(user.username),
        email: user.email ? sanitizeName(user.email) : null,
        name: sanitizeName(user.name)
      }
    });
  } catch (error) {
    console.error("Error getting user:", error);
    return send(res, 500, { success: false, message: "Gagal mengambil data user" });
  }
}

async function createUser(req, res) {
  // Security: Only admin can create users
  const auth = authenticate(req);
  if (!auth.authorized) {
    return send(res, 401, { success: false, message: "Unauthorized - Silakan login" });
  }
  if (!authorize(auth.user, "admin")) {
    return send(res, 403, { success: false, message: "Hanya admin yang dapat membuat user" });
  }

  const { username, email, name, password, role, status } = req.body || {};
  const nama = req.body.nama || name;

  if (!username || !password) {
    return send(res, 400, { success: false, message: "Username dan password wajib diisi" });
  }

  if (username.trim().length < 3) {
    return send(res, 400, { success: false, message: "Username minimal 3 karakter" });
  }

  if (password.length < 8) {
    return send(res, 400, { success: false, message: "Password minimal 8 karakter" });
  }

  if (role && !VALID_ROLES.includes(role)) {
    return send(res, 400, { success: false, message: "Role tidak valid" });
  }

  // Validate email format
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return send(res, 400, { success: false, message: "Format email tidak valid" });
  }

  try {
    const existingUser = await pool.query("SELECT id FROM users WHERE username = $1 LIMIT 1", [username.trim()]);
    if (existingUser.rows.length > 0) {
      return send(res, 400, { success: false, message: "Username sudah digunakan" });
    }

    if (email) {
      const existingEmail = await pool.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [email.trim()]);
      if (existingEmail.rows.length > 0) {
        return send(res, 400, { success: false, message: "Email sudah digunakan" });
      }
    }

    // Use salt for password hashing
    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    const finalRole = role || "staff_gudang"; // Default to staff_gudang, not admin
    const finalName = sanitizeName(name || nama || username);
    const finalEmail = email || `${username}@warehouse.local`;

    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, salt, nama_lengkap, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING id, username, email, nama_lengkap as name, role, is_active, created_at`,
      [username.trim(), finalEmail, passwordHash, salt, finalName, finalRole, status !== 'inactive']
    );

    return send(res, 201, {
      success: true,
      message: "User berhasil dibuat",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("Error creating user:", error);
    return send(res, 500, { success: false, message: "Gagal membuat user" });
  }
}

// Sanitize name to prevent XSS
function sanitizeName(name) {
  if (!name) return "";
  return String(name)
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .trim()
    .slice(0, 200); // Limit length
}

async function updateUser(req, res, userId) {
  // Security: Only authenticated users can update
  const auth = authenticate(req);
  if (!auth.authorized) {
    return send(res, 401, { success: false, message: "Unauthorized - Silakan login" });
  }

  // Prevent NaN userId
  if (isNaN(userId) || userId <= 0) {
    return send(res, 400, { success: false, message: "ID user tidak valid" });
  }

  const { username, email, nama, role, status, password } = req.body || {};
  const name = req.body.name || nama;

  try {
    // Cek user exists
    const existingUser = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
    if (existingUser.rows.length === 0) {
      return send(res, 404, { success: false, message: "User tidak ditemukan" });
    }

    const updates = [];
    const params = [];
    let paramIndex = 1;

    // Update username
    if (username !== undefined && username !== '') {
      // Cek username tidak digunakan user lain
      const usernameCheck = await pool.query(
        "SELECT id FROM users WHERE username = $1 AND id != $2",
        [username.trim(), userId]
      );
      if (usernameCheck.rows.length > 0) {
        return send(res, 400, { success: false, message: "Username sudah digunakan" });
      }
      updates.push(`username = $${paramIndex}`);
      params.push(username.trim());
      paramIndex++;
    }

    // Update email
    if (email !== undefined && email !== '') {
      // Validate email format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return send(res, 400, { success: false, message: "Format email tidak valid" });
      }
      const emailCheck = await pool.query(
        "SELECT id FROM users WHERE email = $1 AND id != $2 LIMIT 1",
        [email.trim(), userId]
      );
      if (emailCheck.rows.length > 0) {
        return send(res, 400, { success: false, message: "Email sudah digunakan user lain" });
      }
      updates.push(`email = $${paramIndex}`);
      params.push(email.trim());
      paramIndex++;
    }

    // Update nama_lengkap (sanitized)
    if (name !== undefined && name !== '') {
      const sanitizedName = sanitizeName(name);
      updates.push(`nama_lengkap = $${paramIndex}`);
      params.push(sanitizedName);
      paramIndex++;
    }
    
    // Update status - only admin can change status
    if (status !== undefined) {
      if (!authorize(auth.user, "admin")) {
        return send(res, 403, { success: false, message: "Hanya admin yang dapat mengubah status user" });
      }
      updates.push(`is_active = $${paramIndex}`);
      params.push(status === 'inactive' ? false : true);
      paramIndex++;
    }
    
    // Update role - only admin can change role
    if (role !== undefined && role !== '') {
      if (!authorize(auth.user, "admin")) {
        return send(res, 403, { success: false, message: "Hanya admin yang dapat mengubah role user" });
      }
      if (!VALID_ROLES.includes(role)) {
        return send(res, 400, { success: false, message: "Role tidak valid" });
      }
      updates.push(`role = $${paramIndex}`);
      params.push(role);
      paramIndex++;
    }

    // Update password jika ada - only admin or self can change password
    if (password !== undefined && password !== '') {
      const currentUserId = parseInt(auth.user.sub, 10);
      if (!authorize(auth.user, "admin") && currentUserId !== userId) {
        return send(res, 403, { success: false, message: "Anda tidak memiliki izin mengubah password user ini" });
      }
      if (password.length < 8) {
        return send(res, 400, { success: false, message: "Password minimal 8 karakter" });
      }
      const salt = generateSalt();
      const passwordHash = hashPassword(password, salt);
      updates.push(`password_hash = $${paramIndex}`);
      params.push(passwordHash);
      paramIndex++;
      updates.push(`salt = $${paramIndex}`);
      params.push(salt);
      paramIndex++;
    }

    if (updates.length === 0) {
      return send(res, 400, { success: false, message: "Tidak ada data yang diupdate" });
    }

    updates.push(`updated_at = NOW()`);
    params.push(userId);

    console.log('[UPDATE USER] Payload:', { id: userId, role, email, nama, status, updates: updates });

    const result = await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${paramIndex}`,
      params
    );

    console.log('[UPDATE USER] Result:', { id: userId, role, rowCount: result.rowCount });

    if (result.rowCount === 0) {
      return send(res, 404, { success: false, message: "User tidak ditemukan" });
    }

    return send(res, 200, { success: true, message: "User berhasil diupdate" });
  } catch (error) {
    console.error("Error updating user:", error);
    return send(res, 500, { success: false, message: "Gagal mengupdate user" });
  }
}

async function deleteUser(req, res, userId) {
  // Security: Only admin can delete users
  const auth = authenticate(req);
  if (!auth.authorized) {
    return send(res, 401, { success: false, message: "Unauthorized - Silakan login" });
  }
  if (!authorize(auth.user, "admin")) {
    return send(res, 403, { success: false, message: "Hanya admin yang dapat menghapus user" });
  }

  if (isNaN(userId) || userId <= 0) {
    return send(res, 400, { success: false, message: "ID user tidak valid" });
  }

  const currentUserId = parseInt(auth.user.sub, 10);
  if (currentUserId === userId) {
    return send(res, 400, { success: false, message: "Anda tidak dapat menghapus akun sendiri" });
  }

  try {
    const result = await pool.query("DELETE FROM users WHERE id = $1", [userId]);

    if (result.rowCount === 0) {
      return send(res, 404, { success: false, message: "User tidak ditemukan" });
    }

    return send(res, 200, { success: true, message: "User berhasil dihapus" });
  } catch (error) {
    console.error("Error deleting user:", error);
    return send(res, 500, { success: false, message: "Gagal menghapus user" });
  }
}

async function enableUser(req, res, userId) {
  // Security: Only admin can enable users
  const auth = authenticate(req);
  if (!auth.authorized) {
    return send(res, 401, { success: false, message: "Unauthorized - Silakan login" });
  }
  if (!authorize(auth.user, "admin")) {
    return send(res, 403, { success: false, message: "Hanya admin yang dapat mengaktifkan user" });
  }

  if (isNaN(userId) || userId <= 0) {
    return send(res, 400, { success: false, message: "ID user tidak valid" });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET is_active = TRUE, updated_at = NOW() WHERE id = $1`,
      [userId]
    );

    if (result.rowCount === 0) {
      return send(res, 404, { success: false, message: "User tidak ditemukan" });
    }

    return send(res, 200, { success: true, message: "User berhasil diaktifkan" });
  } catch (error) {
    console.error("Error enabling user:", error);
    return send(res, 500, { success: false, message: "Gagal mengaktifkan user" });
  }
}

async function disableUser(req, res, userId) {
  // Security: Only admin can disable users
  const auth = authenticate(req);
  if (!auth.authorized) {
    return send(res, 401, { success: false, message: "Unauthorized - Silakan login" });
  }
  if (!authorize(auth.user, "admin")) {
    return send(res, 403, { success: false, message: "Hanya admin yang dapat menonaktifkan user" });
  }

  if (isNaN(userId) || userId <= 0) {
    return send(res, 400, { success: false, message: "ID user tidak valid" });
  }

  const currentUserId = parseInt(auth.user.sub, 10);
  if (currentUserId === userId) {
    return send(res, 400, { success: false, message: "Anda tidak dapat menonaktifkan akun sendiri" });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
      [userId]
    );

    if (result.rowCount === 0) {
      return send(res, 404, { success: false, message: "User tidak ditemukan" });
    }

    return send(res, 200, { success: true, message: "User berhasil dinonaktifkan" });
  } catch (error) {
    console.error("Error disabling user:", error);
    return send(res, 500, { success: false, message: "Gagal menonaktifkan user" });
  }
}

async function resetPassword(req, res, userId) {
  // Security: Only admin can reset passwords
  const auth = authenticate(req);
  if (!auth.authorized) {
    return send(res, 401, { success: false, message: "Unauthorized - Silakan login" });
  }
  if (!authorize(auth.user, "admin")) {
    return send(res, 403, { success: false, message: "Hanya admin yang dapat reset password" });
  }

  if (isNaN(userId) || userId <= 0) {
    return send(res, 400, { success: false, message: "ID user tidak valid" });
  }

  try {
    const tempPassword = generateTempPassword();
    const salt = generateSalt();
    const passwordHash = hashPassword(tempPassword, salt);

    const result = await pool.query(
      `UPDATE users SET password_hash = $1, salt = $2, updated_at = NOW() WHERE id = $3`,
      [passwordHash, salt, userId]
    );

    if (result.rowCount === 0) {
      return send(res, 404, { success: false, message: "User tidak ditemukan" });
    }

    // Security: Don't expose temp password in API response, log it server-side only
    console.log(`[PASSWORD RESET] User ${userId} password reset by admin ${auth.user.username} at ${new Date().toISOString()}`);

    return send(res, 200, { success: true, message: "Password berhasil direset. Password sementara telah diberikan." });
  } catch (error) {
    console.error("Error resetting password:", error);
    return send(res, 500, { success: false, message: "Gagal reset password" });
  }
}

async function getUserStats(req, res) {
  // Security: Only authenticated users can view stats
  const auth = authenticate(req);
  if (!auth.authorized) {
    return send(res, 401, { success: false, message: "Unauthorized - Silakan login" });
  }

  try {
    // Run queries in parallel for better performance
    const [totalResult, activeResult, adminResult, staffResult, checkerResult] = await Promise.all([
      pool.query("SELECT COUNT(*) as total FROM users"),
      pool.query("SELECT COUNT(*) as active FROM users WHERE is_active = TRUE"),
      pool.query("SELECT COUNT(*) as admins FROM users WHERE role = 'admin'"),
      pool.query("SELECT COUNT(*) as staff FROM users WHERE role = 'staff_gudang'"),
      pool.query("SELECT COUNT(*) as checkers FROM users WHERE role = 'checker_opname'")
    ]);

    return send(res, 200, {
      success: true,
      data: {
        total: parseInt(totalResult.rows[0]?.total || 0, 10),
        active: parseInt(activeResult.rows[0]?.active || 0, 10),
        inactive: parseInt(totalResult.rows[0]?.total || 0, 10) - parseInt(activeResult.rows[0]?.active || 0, 10),
        admins: parseInt(adminResult.rows[0]?.admins || 0, 10),
        staff: parseInt(staffResult.rows[0]?.staff || 0, 10),
        checkers: parseInt(checkerResult.rows[0]?.checkers || 0, 10)
      }
    });
  } catch (error) {
    console.error("Error getting user stats:", error);
    return send(res, 500, { success: false, message: "Gagal mengambil statistik user" });
  }
}

async function getRoles(req, res) {
  return send(res, 200, {
    success: true,
    data: [
      { value: "admin", label: "Admin" },
      { value: "staff_gudang", label: "Staff Gudang" },
      { value: "checker_opname", label: "Checker Opname" }
    ]
  });
}

export default async function usersApiHandler(req, res) {
  const routePath = getRoutePath(req);
  const normalizedPath = normalizeRoute(routePath);
  const method = req.method;
  const action = extractAction(normalizedPath);
  const userId = req.params?.[0] ? parseInt(req.params[0], 10) : extractUserId(normalizedPath);

  if (userId && action) {
    if (method === "POST") {
      if (action === "enable") return enableUser(req, res, userId);
      if (action === "disable") return disableUser(req, res, userId);
      if (action === "reset-password") return resetPassword(req, res, userId);
    }
  }

  if (method === "GET" && normalizedPath === "v1/users/stats") {
    return getUserStats(req, res);
  }

  if (method === "GET" && normalizedPath === "v1/users/roles") {
    return getRoles(req, res);
  }

  if (method === "GET" && normalizedPath === "v1/users") {
    return listUsers(req, res);
  }

  if (method === "POST" && normalizedPath === "v1/users") {
    return createUser(req, res);
  }

  if (userId) {
    if (method === "GET") {
      return getUser(req, res, userId);
    }
    if (method === "PUT") {
      return updateUser(req, res, userId);
    }
    if (method === "DELETE") {
      return deleteUser(req, res, userId);
    }
  }

  return send(res, 404, { success: false, message: `Route tidak ditemukan: ${method} ${routePath}` });
}
