import pool from "../services/db.js";

// V3 Admin Dashboard - Data from Neon Database
// Optimized: parallel queries, minimal payload (summary only)
export default async function handler(req, res) {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Get filter params from query string
    const url = new URL(req.url, "http://localhost");
    const filterBulan = parseInt(url.searchParams.get('bulan')) || currentMonth;
    const filterTahun = parseInt(url.searchParams.get('tahun')) || currentYear;

    // Helper to build date range for period
    const startOfMonth = new Date(filterTahun, filterBulan - 1, 1);
    const endOfMonth = new Date(filterTahun, filterBulan, 0);
    const dateStart = startOfMonth.toISOString().split('T')[0];
    const dateEnd = endOfMonth.toISOString().split('T')[0];

    // Check if outlet_master table exists (single check reused below)
    const tableCheck = await pool.query(`
      SELECT to_regclass('public.outlet_master') IS NOT NULL AS exists
    `);
    const isJuliAtauSesudahnya = (filterTahun > 2025) || (filterTahun === 2025 && filterBulan >= 7);
    const useOutletMaster = isJuliAtauSesudahnya && tableCheck.rows[0]?.exists;

    // ============ PARALLEL QUERY GROUP 1: KPI & Agregat ============
    // These queries are independent and can run concurrently.
    const [
      distribusiPeriode,
      penjualanPeriode,
      profitPeriode,
      totalSiswaAktif,
      produkAktif,
      totalProduk,
      soBerjalan,
      soSelesai,
      totalUsers,
      stokGudang
    ] = await Promise.all([
      // 1. Distribusi Periode
      pool.query(`SELECT COALESCE(SUM(qty), 0) AS total_qty FROM penjualan WHERE tanggal >= $1 AND tanggal <= $2`, [dateStart, dateEnd]),

      // 2. Penjualan Periode
      pool.query(`SELECT COALESCE(SUM(j.qty), 0) AS total_qty, COALESCE(SUM(j.qty * COALESCE(p.harga_jual, 0)), 0) AS nominal, COUNT(DISTINCT j.nama_outlet) AS customer_count, COUNT(*) AS total_transaksi FROM penjualan j LEFT JOIN produk p ON p.sku = j.sku WHERE j.tanggal >= $1 AND j.tanggal <= $2`, [dateStart, dateEnd]),

      // 3. Profit Periode
      pool.query(`SELECT COALESCE(SUM((COALESCE(p.harga_jual, 0) - COALESCE(p.harga_beli, 0)) * j.qty), 0) AS total_profit FROM penjualan j LEFT JOIN produk p ON p.sku = j.sku WHERE j.tanggal >= $1 AND j.tanggal <= $2`, [dateStart, dateEnd]),

      // 4. Total Siswa Aktif
      pool.query(`SELECT COALESCE(SUM(jumlah_siswa), 0) AS total_siswa FROM outlet_siswa_level_bulanan WHERE EXTRACT(MONTH FROM periode) = $1 AND EXTRACT(YEAR FROM periode) = $2`, [filterBulan, filterTahun]),

      // 5. Produk Aktif
      pool.query(`SELECT COUNT(DISTINCT sku) AS total FROM penjualan WHERE tanggal >= $1 AND tanggal <= $2`, [dateStart, dateEnd]),

      // 7. Total Produk
      pool.query(`SELECT COUNT(*) AS total FROM produk`),

      // 10. SO Berjalan
      pool.query(`SELECT COUNT(*) AS total FROM stok_opname_perintah WHERE status IN ('menunggu', 'proses')`),

      // 11. SO Selesai Bulan Ini
      pool.query(`SELECT COUNT(*) AS total FROM stok_opname_perintah WHERE status = 'selesai' AND bulan = $1 AND tahun = $2`, [filterBulan, filterTahun]),

      // 12. Total Users
      pool.query(`SELECT COUNT(*) AS total FROM users WHERE is_active = true`),

      // 13. Stok Gudang Aktual
      pool.query(`WITH params AS (SELECT CURRENT_DATE AS end_date), base_stock AS (SELECT COALESCE(SUM(qty_awal), 0) AS total FROM stok_awal), pembelian_total AS (SELECT COALESCE(SUM(qty), 0) AS total FROM pembelian WHERE tanggal <= (SELECT end_date FROM params)), penjualan_total AS (SELECT COALESCE(SUM(qty), 0) AS total FROM penjualan WHERE tanggal <= (SELECT end_date FROM params)), penyesuaian_total AS (SELECT COALESCE(SUM(qty), 0) AS total FROM stok_penyesuaian WHERE tanggal <= (SELECT end_date FROM params)) SELECT bs.total AS stok_awal, pt.total AS pembelian, pj.total AS penjualan, pen.total AS penyesuaian, bs.total + pt.total - pj.total + pen.total AS stok_akhir FROM base_stock bs, pembelian_total pt, penjualan_total pj, penyesuaian_total pen`)
    ]);

    // ============ Outlet Stats (parallel within group) ============
    let outletStats = { rows: [{ total_outlet: 0, outlet_transaksi: 0, outlet_non_transaksi: 0, outlet_detail: [], outlet_non_transaksi_detail: [] }] };
    let outletAktifResult;
    let totalOutletResult;

    try {
      if (useOutletMaster) {
        // === JULI 2025+ LOGIC ===
        const [
          allMasterOutlets,
          outletTransaksiData,
          outletNonTransaksiData
        ] = await Promise.all([
          pool.query(`SELECT o.id, o.nama_outlet FROM outlet_master om JOIN outlet o ON o.id = om.outlet_id WHERE om.is_active = TRUE ORDER BY o.nama_outlet`),
          pool.query(`SELECT pj.nama_outlet, SUM(pj.qty) AS total_qty, COUNT(*) AS jumlah_transaksi FROM penjualan pj WHERE pj.tanggal >= $1 AND pj.tanggal <= $2 AND UPPER(TRIM(pj.nama_outlet)) IN (SELECT UPPER(TRIM(o2.nama_outlet)) FROM outlet_master om2 JOIN outlet o2 ON o2.id = om2.outlet_id WHERE om2.is_active = TRUE) GROUP BY pj.nama_outlet ORDER BY total_qty DESC`, [dateStart, dateEnd]),
          pool.query(`SELECT o.id, o.nama_outlet FROM outlet_master om JOIN outlet o ON o.id = om.outlet_id WHERE om.is_active = TRUE AND UPPER(TRIM(o.nama_outlet)) NOT IN (SELECT DISTINCT UPPER(TRIM(pj.nama_outlet)) FROM penjualan pj WHERE pj.tanggal >= $1 AND pj.tanggal <= $2) ORDER BY o.nama_outlet`, [dateStart, dateEnd])
        ]);

        outletStats = {
          rows: [{
            total_outlet: allMasterOutlets.rows.length,
            outlet_transaksi: outletTransaksiData.rows.length,
            outlet_non_transaksi: outletNonTransaksiData.rows.length,
            // Minimalisir payload: kirim hanya top 10 detail untuk ringkasan dashboard
            outlet_detail: outletTransaksiData.rows.slice(0, 10).map(r => ({ nama_outlet: r.nama_outlet, total_qty: Number(r.total_qty || 0), jumlah_transaksi: Number(r.jumlah_transaksi || 0) })),
            outlet_non_transaksi_detail: outletNonTransaksiData.rows.slice(0, 10).map(r => ({ id: r.id, nama_outlet: r.nama_outlet }))
          }]
        };

        outletAktifResult = await pool.query(`SELECT COUNT(DISTINCT o.id) AS total FROM outlet_master om JOIN outlet o ON o.id = om.outlet_id INNER JOIN penjualan pj ON UPPER(pj.nama_outlet) = UPPER(o.nama_outlet) AND pj.tanggal >= $1 AND pj.tanggal <= $2 WHERE om.is_active = TRUE`, [dateStart, dateEnd]);
        totalOutletResult = await pool.query(`SELECT COUNT(*) AS total FROM outlet_master om WHERE om.is_active = TRUE`);
      } else {
        // === SEBELUM JULI 2025 LOGIC ===
        const [
          outletTransaksiData,
          outletNonTransaksiData,
          totalOutletQuery
        ] = await Promise.all([
          pool.query(`SELECT o.id, o.nama_outlet, COALESCE(SUM(pj.qty), 0) AS total_qty, COUNT(pj.id) AS jumlah_transaksi FROM outlet o INNER JOIN penjualan pj ON UPPER(pj.nama_outlet) = UPPER(o.nama_outlet) AND pj.tanggal >= $1 AND pj.tanggal <= $2 GROUP BY o.id, o.nama_outlet ORDER BY total_qty DESC`, [dateStart, dateEnd]),
          pool.query(`SELECT o.id, o.nama_outlet FROM outlet o WHERE NOT EXISTS (SELECT 1 FROM penjualan pj WHERE UPPER(pj.nama_outlet) = UPPER(o.nama_outlet) AND pj.tanggal >= $1 AND pj.tanggal <= $2) ORDER BY o.nama_outlet`, [dateStart, dateEnd]),
          pool.query(`SELECT COUNT(*) AS total FROM outlet`)
        ]);

        outletStats = {
          rows: [{
            total_outlet: Number(totalOutletQuery.rows[0]?.total || 0),
            outlet_transaksi: outletTransaksiData.rows.length,
            outlet_non_transaksi: outletNonTransaksiData.rows.length,
            outlet_detail: outletTransaksiData.rows.slice(0, 10).map(r => ({ nama_outlet: r.nama_outlet, total_qty: Number(r.total_qty || 0), jumlah_transaksi: Number(r.jumlah_transaksi || 0) })),
            outlet_non_transaksi_detail: outletNonTransaksiData.rows.slice(0, 10).map(r => ({ id: r.id, nama_outlet: r.nama_outlet }))
          }]
        };

        outletAktifResult = await pool.query(`SELECT COUNT(DISTINCT nama_outlet) AS total FROM penjualan WHERE tanggal >= $1 AND tanggal <= $2`, [dateStart, dateEnd]);
        totalOutletResult = totalOutletQuery;
      }
    } catch (err) {
      console.error('Outlet stats query error:', err.message);
      outletStats = { rows: [{ total_outlet: 0, outlet_transaksi: 0, outlet_non_transaksi: 0, outlet_detail: [], outlet_non_transaksi_detail: [] }] };
      outletAktifResult = { rows: [{ total: 0 }] };
      totalOutletResult = { rows: [{ total: 0 }] };
    }

    // ============ Stok Kritis (parallel group) ============
    let stokKritis = { rows: [{ kritis_count: 0 }] };
    let stokKritisList = { rows: [] };
    try {
      const [kritisCount, kritisList] = await Promise.all([
        pool.query(`WITH produk_stok AS (SELECT p.sku, p.nama_produk, COALESCE((SELECT SUM(qty_awal) FROM stok_awal WHERE sku = p.sku GROUP BY sku), 0) + COALESCE((SELECT SUM(qty) FROM pembelian WHERE sku = p.sku GROUP BY sku), 0) - COALESCE((SELECT SUM(qty) FROM penjualan WHERE sku = p.sku GROUP BY sku), 0) + COALESCE((SELECT SUM(qty) FROM stok_penyesuaian WHERE sku = p.sku GROUP BY sku), 0) AS stok_akhir FROM produk p) SELECT COUNT(*) AS kritis_count FROM produk_stok WHERE stok_akhir <= 0 OR stok_akhir < 10`),
        pool.query(`WITH produk_stok AS (SELECT p.sku, p.nama_produk, COALESCE((SELECT SUM(qty_awal) FROM stok_awal WHERE sku = p.sku GROUP BY sku), 0) + COALESCE((SELECT SUM(qty) FROM pembelian WHERE sku = p.sku GROUP BY sku), 0) - COALESCE((SELECT SUM(qty) FROM penjualan WHERE sku = p.sku GROUP BY sku), 0) + COALESCE((SELECT SUM(qty) FROM stok_penyesuaian WHERE sku = p.sku GROUP BY sku), 0) AS stok_akhir FROM produk p) SELECT sku, nama_produk, stok_akhir FROM produk_stok WHERE stok_akhir <= 0 OR stok_akhir < 10 ORDER BY stok_akhir ASC LIMIT 20`)
      ]);
      stokKritis = kritisCount;
      stokKritisList = kritisList;
    } catch (err) {
      console.error('Stok kritis query error:', err.message);
      try {
        const [kritisCount, kritisList] = await Promise.all([
          pool.query(`SELECT COUNT(*) AS kritis_count FROM produk WHERE COALESCE(stok, 0) < 10`),
          pool.query(`SELECT sku, nama_produk, COALESCE(stok, 0) AS stok_akhir FROM produk WHERE COALESCE(stok, 0) < 10 ORDER BY stok ASC LIMIT 20`)
        ]);
        stokKritis = kritisCount;
        stokKritisList = kritisList;
      } catch (err2) {
        console.error('Fallback stok kritis error:', err2.message);
      }
    }

    const result = {
      filter: {
        bulan: filterBulan,
        tahun: filterTahun
      },
      periode: {
        distribusi: {
          qty: Number(distribusiPeriode.rows[0]?.total_qty || 0)
        },
        penjualan: {
          qty: Number(penjualanPeriode.rows[0]?.total_qty || 0),
          nominal: Number(penjualanPeriode.rows[0]?.nominal || 0),
          customer_count: Number(penjualanPeriode.rows[0]?.customer_count || 0),
          total_transaksi: Number(penjualanPeriode.rows[0]?.total_transaksi || 0)
        },
        profit: Number(profitPeriode.rows[0]?.total_profit || 0),
        total_siswa: Number(totalSiswaAktif.rows[0]?.total_siswa || 0)
      },
      outlet_stats: {
        total: Number(outletStats.rows[0]?.total_outlet || 0),
        transaksi: Number(outletStats.rows[0]?.outlet_transaksi || 0),
        non_transaksi: Number(outletStats.rows[0]?.outlet_non_transaksi || 0),
        detail: outletStats.rows[0]?.outlet_detail || [],
        non_transaksi_detail: outletStats.rows[0]?.outlet_non_transaksi_detail || []
      },
      produk: {
        aktif: Number(produkAktif.rows[0]?.total || 0),
        total: Number(totalProduk.rows[0]?.total || 0)
      },
      outlet: {
        aktif: Number(outletAktifResult.rows[0]?.total || 0),
        total: Number(totalOutletResult.rows[0]?.total || 0)
      },
      stok: {
        kritis: Number(stokKritis.rows[0]?.kritis_count || 0),
        kritis_list: stokKritisList.rows.map(r => ({
          sku: r.sku,
          nama_produk: r.nama_produk,
          stok: Number(r.stok_akhir || 0)
        })),
        gudang: {
          awal: Number(stokGudang.rows[0]?.stok_awal || 0),
          pembelian: Number(stokGudang.rows[0]?.pembelian || 0),
          penjualan: Number(stokGudang.rows[0]?.penjualan || 0),
          penyesuaian: Number(stokGudang.rows[0]?.penyesuaian || 0),
          akhir: Number(stokGudang.rows[0]?.stok_akhir || 0)
        }
      },
      opname: {
        berjalan: Number(soBerjalan.rows[0]?.total || 0),
        selesai_bulan_ini: Number(soSelesai.rows[0]?.total || 0)
      },
      users: {
        total: Number(totalUsers.rows[0]?.total || 0)
      },
      generated_at: new Date().toISOString()
    };

    res.status(200).json(result);
  } catch (err) {
    console.error("V3 DASHBOARD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
}