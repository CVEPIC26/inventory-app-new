import authHandler from "../backend/auth.js";
import addOutletHandler from "../backend/add-outlet.js";
import addPembelianHandler from "../backend/add-pembelian.js";
import addPenjualanHandler from "../backend/add-penjualan.js";
import addStokAwalHandler from "../backend/add-stok_awal.js";
import apiPenjualanHandler from "../backend/api-penjualan.js";
import apiPembelianHandler from "../backend/api-pembelian.js";
import auditHandler from "../backend/audit.js";
import chartHandler from "../backend/chart.js";
// forecast.js REMOVED - feature deprecated
import importOutletHandler from "../backend/import-outlet.js";
import importPembelianHandler from "../backend/import-pembelian.js";
import importPenjualanHandler from "../backend/import-penjualan.js";
import importStokAwalHandler from "../backend/import-stok_awal.js";
import kpiHandler from "../backend/kpi.js";
import opnameHistoryHandler from "../backend/opname-history.js";
import opnamePerintahHandler from "../backend/opname-perintah.js";
import opnameExportHandler from "../backend/stok-opname-export.js";
import outletStatusHandler from "../backend/outlet-status.js";
import outletListHandler from "../backend/outlet-list.js";
import persediaanHandler from "../backend/persediaan.js";
import outletTransaksiHandler from "../backend/outlet-transaksi.js";
import produkListHandler from "../backend/produk-list.js";
import simpanOpnameHandler from "../backend/simpan-opname.js";
import sesuaikanOpnameHandler from "../backend/sesuaikan-opname.js";
import stokSistemHandler from "../backend/stok-sistem.js";
import templateOutletHandler from "../backend/template-outlet.js";
import templatePembelianHandler from "../backend/template-pembelian.js";
import templatePenjualanHandler from "../backend/template-penjualan.js";
import templateStokAwalHandler from "../backend/template-stok_awal.js";
import topOutletHandler from "../backend/top-outlet.js";
import topProdukHandler from "../backend/top-produk.js";
import miniReviewHandler from "../backend/mini-review.js";
import v3DashboardHandler from "../backend/v3-dashboard.js";
import v3PenjualanHandler from "../backend/v3-penjualan.js";
import v3PersediaanHandler from "../backend/v3-persediaan.js";
import v3OpnameHandler from "../backend/v3-opname.js";
import v3OpnameDetailHandler from "../backend/v3-opname-detail.js";
import v3ChartHandler from "../backend/v3-chart.js";
import usersApiHandler from "../backend/users-api.js";
import approvalApiHandler from "../backend/approval-api.js";
import settingsApiHandler from "../backend/settings-api.js";
import apiStokHandler from "../backend/api-stok.js";
import v1ProdukHandler from "../backend/v1-produk.js";
import v1StokGudangHandler from "../backend/v1-stok-gudang.js";
import { isDatabaseConfigured, checkDatabaseHealth } from "../services/db.js";

// Health check handler
async function healthHandler(req, res) {
  const dbConfigured = isDatabaseConfigured();
  const dbHealth = dbConfigured ? await checkDatabaseHealth() : { healthy: false, error: "DATABASE_URL not set" };
  
  res.json({
    status: dbHealth.healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: '3.0.0',
    database: {
      configured: dbConfigured,
      healthy: dbHealth.healthy,
      error: dbHealth.error || null
    },
    environment: process.env.NODE_ENV || 'production'
  });
}

const routes = {
  // Health check
  "GET /v1/health": healthHandler,
  "GET /health": healthHandler,

  // Auth routes
  "POST /v1/auth/login": authHandler,
  "POST /v1/auth/login/admin": authHandler,
  "POST /v1/auth/login/user": authHandler,
  "POST /v1/auth/logout": authHandler,

  // User management routes
  "GET /v1/users": usersApiHandler,
  "POST /v1/users": usersApiHandler,
  "GET /v1/users/stats": usersApiHandler,
  "GET /v1/users/roles": usersApiHandler,
  "GET /v1/users/:id": usersApiHandler,
  "PUT /v1/users/:id": usersApiHandler,
  "DELETE /v1/users/:id": usersApiHandler,
  "POST /v1/users/:id/enable": usersApiHandler,
  "POST /v1/users/:id/disable": usersApiHandler,
  "POST /v1/users/:id/reset-password": usersApiHandler,

  // Produk management routes (CRUD)
  "GET /v1/produk": v1ProdukHandler,
  "POST /v1/produk": v1ProdukHandler,
  "PUT /v1/produk/:sku": v1ProdukHandler,
  "DELETE /v1/produk/:sku": v1ProdukHandler,

  // Approval management routes
  "GET /v1/approvals": approvalApiHandler,
  "GET /v1/approvals/stats": approvalApiHandler,
  "GET /v1/approvals/:id": approvalApiHandler,
  "POST /v1/approvals/:id/approve": approvalApiHandler,
  "POST /v1/approvals/:id/reject": approvalApiHandler,
  "POST /v1/approvals/:id/recount": approvalApiHandler,

  // Settings and Profile routes
  "GET /v1/auth/me": settingsApiHandler,
  "PUT /v1/users/profile": settingsApiHandler,
  "POST /v1/auth/change-password": settingsApiHandler,
  "GET /v1/settings/system": settingsApiHandler,
  "GET /v1/settings/database": settingsApiHandler,
  "GET /v1/audit/logs": settingsApiHandler,

  // KPI and Dashboard routes
  "GET /kpi": kpiHandler,
  "GET /chart": chartHandler,
  "GET /mini-review": miniReviewHandler,
  "GET /top-produk": topProdukHandler,
  "GET /top-outlet": topOutletHandler,
  "GET /outlet-status": outletStatusHandler,
  "GET /outlet-list": outletListHandler,
  "GET /outlet-transaksi": outletTransaksiHandler,
  "GET /template-outlet": templateOutletHandler,
  "GET /template-penjualan": templatePenjualanHandler,
  "GET /template-pembelian": templatePembelianHandler,
  "GET /template-stok_awal": templateStokAwalHandler,
  "GET /stok-sistem": stokSistemHandler,
  "GET /opname-history": opnameHistoryHandler,
  "GET /v1/opname/history": opnameHistoryHandler,
  "GET /opname-perintah": opnamePerintahHandler,
  "POST /opname-perintah": opnamePerintahHandler,
  "DELETE /opname-perintah/:id": opnamePerintahHandler,
  "GET /opname-export": opnameExportHandler,
  "GET /persediaan": persediaanHandler,
  "GET /audit": auditHandler,
  // Penjualan CRUD API routes
  "GET /v1/penjualan": apiPenjualanHandler,
  "GET /v1/penjualan/:id": apiPenjualanHandler,
  "POST /v1/penjualan": apiPenjualanHandler,
  "POST /v1/penjualan/import": apiPenjualanHandler,
  "PUT /v1/penjualan/:id": apiPenjualanHandler,
  "DELETE /v1/penjualan/:id": apiPenjualanHandler,

  // Pembelian CRUD API routes
  "GET /v1/pembelian": apiPembelianHandler,
  "GET /v1/pembelian/:id": apiPembelianHandler,
  "POST /v1/pembelian": apiPembelianHandler,
  "POST /v1/pembelian/import": apiPembelianHandler,
  "PUT /v1/pembelian/:id": apiPembelianHandler,
  "DELETE /v1/pembelian/:id": apiPembelianHandler,

  // Supplier API routes
  "GET /v1/supplier": apiPembelianHandler,

  // Stok Module API routes (Sprint 4)
  "GET /v1/stok/realtime": apiStokHandler,
  "GET /v1/stok/kartu": apiStokHandler,
  "GET /v1/stok/mutasi": apiStokHandler,
  "GET /v1/stok/gudang": v1StokGudangHandler,

  // GET /forecast REMOVED - feature deprecated
  "GET /produk-list": produkListHandler,
  "GET /v3-dashboard": v3DashboardHandler,
  "GET /v3-penjualan": v3PenjualanHandler,
  "GET /v3-persediaan": v3PersediaanHandler,
  "GET /v3-opname": v3OpnameHandler,
  "POST /v3-opname": v3OpnameHandler,
  "PUT /v3-opname": v3OpnameHandler,
  "GET /v3-opname-detail": v3OpnameDetailHandler,
  "POST /v3-opname-detail": v3OpnameDetailHandler,
  "GET /v3-chart": v3ChartHandler,
  "POST /add-penjualan": addPenjualanHandler,
  "POST /add-pembelian": addPembelianHandler,
  "POST /add-stok_awal": addStokAwalHandler,
  "POST /add-outlet": addOutletHandler,
  "POST /import-penjualan": importPenjualanHandler,
  "POST /import-pembelian": importPembelianHandler,
  "POST /import-stok_awal": importStokAwalHandler,
  "POST /import-outlet": importOutletHandler,
  "POST /simpan-opname": simpanOpnameHandler,
  "POST /sesuaikan-opname": sesuaikanOpnameHandler
};

function getRoutePath(req) {
  if (req.query?.route) {
    return `/${String(req.query.route).replace(/^\/+/, "")}`;
  }

  const url = new URL(req.url, "http://localhost");
  return url.pathname.replace(/^\/api/, "") || "/";
}

export default async function handler(req, res) {
  const routePath = getRoutePath(req);
  const key = `${req.method} ${routePath}`;
  let routeHandler = routes[key];

  // If no exact match, try parameterized routes
  if (!routeHandler) {
    const method = req.method;
    for (const pattern of Object.keys(routes)) {
      if (!pattern.startsWith(method)) continue;

      const routePattern = pattern.replace(`${method} `, "");
      const regex = new RegExp(`^${routePattern.replace(/:[^/]+/g, '([^/]+)')}$`);
      const match = routePath.match(regex);

      if (match) {
        routeHandler = routes[pattern];
        // Store extracted params for later use
        req.params = match.slice(1);
        break;
      }
    }
  }

  if (!routeHandler) {
    return res.status(404).json({ error: `Route tidak ditemukan: ${key}` });
  }

  return routeHandler(req, res);
}
