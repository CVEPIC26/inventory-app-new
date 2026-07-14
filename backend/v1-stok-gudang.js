import pool from "../services/db.js";

export default async function handler(req, res) {
  const { search, kategori, page = 1, limit = 50 } = req.query || {};
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    // Build WHERE clause
    let whereClause = '';
    const params = [];
    let paramIndex = 1;

    if (search) {
      whereClause += ` WHERE (p.nama_produk ILIKE $${paramIndex} OR p.sku ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (kategori && kategori !== '') {
      whereClause += whereClause ? ' AND' : ' WHERE';
      whereClause += ` p.kategori = $${paramIndex}`;
      params.push(kategori);
      paramIndex++;
    }

    // Get total SKU count
    const totalSkuResult = await pool.query(
      `SELECT COUNT(DISTINCT p.sku) as total FROM produk p ${whereClause}`,
      params
    );
    const totalSku = parseInt(totalSkuResult.rows[0]?.total || 0);

    // Get summary stats
    // Calculate stok_sistem from: stok_awal + pembelian - penjualan + penyesuaian
    const summaryQuery = `
      WITH stok_calc AS (
        SELECT 
          p.sku,
          COALESCE((
            SELECT COALESCE(sa.qty_awal, 0)
            FROM stok_awal sa
            WHERE sa.sku = p.sku
            ORDER BY sa.created_at DESC
            LIMIT 1
          ), 0) as qty_awal,
          COALESCE((
            SELECT COALESCE(SUM(pb.qty), 0)
            FROM pembelian pb
            WHERE pb.sku = p.sku
          ), 0) as total_pembelian,
          COALESCE((
            SELECT COALESCE(SUM(pj.qty), 0)
            FROM penjualan pj
            WHERE pj.sku = p.sku
          ), 0) as total_penjualan,
          COALESCE((
            SELECT COALESCE(SUM(sp.qty), 0)
            FROM stok_penyesuaian sp
            WHERE sp.sku = p.sku
          ), 0) as total_penyesuaian
        FROM produk p
        ${whereClause}
      )
      SELECT 
        SUM(qty_awal + total_pembelian - total_penjualan + total_penyesuaian) as total_unit,
        SUM(CASE WHEN (qty_awal + total_pembelian - total_penjualan + total_penyesuaian) < COALESCE(p.stok_minimum, 10) THEN 1 ELSE 0 END) as stok_rendah
      FROM stok_calc sc
      JOIN produk p ON p.sku = sc.sku
    `;

    const summaryResult = await pool.query(summaryQuery, params);
    const totalUnit = parseInt(summaryResult.rows[0]?.total_unit || 0);
    const stokRendah = parseInt(summaryResult.rows[0]?.stok_rendah || 0);

    // Get items with stok_sistem (stok_fisik from latest opname if available)
    const itemsQuery = `
      WITH stok_calc AS (
        SELECT 
          p.sku,
          p.nama_produk,
          COALESCE(p.kategori, 'lain_lain') as kategori,
          COALESCE(p.stok_minimum, 10) as stok_minimum,
          COALESCE((
            SELECT COALESCE(sa.qty_awal, 0)
            FROM stok_awal sa
            WHERE sa.sku = p.sku
            ORDER BY sa.created_at DESC
            LIMIT 1
          ), 0) as qty_awal,
          COALESCE((
            SELECT COALESCE(SUM(pb.qty), 0)
            FROM pembelian pb
            WHERE pb.sku = p.sku
          ), 0) as total_pembelian,
          COALESCE((
            SELECT COALESCE(SUM(pj.qty), 0)
            FROM penjualan pj
            WHERE pj.sku = p.sku
          ), 0) as total_penjualan,
          COALESCE((
            SELECT COALESCE(SUM(sp.qty), 0)
            FROM stok_penyesuaian sp
            WHERE sp.sku = p.sku
          ), 0) as total_penyesuaian,
          COALESCE((
            SELECT sod.stok_fisik
            FROM stok_opname so
            JOIN stok_opname_detail sod ON sod.opname_id = so.id
            WHERE sod.sku = p.sku
            ORDER BY so.tanggal DESC
            LIMIT 1
          ), NULL) as stok_fisik_opname
        FROM produk p
        ${whereClause}
      )
      SELECT 
        sku,
        nama_produk,
        kategori,
        (qty_awal + total_pembelian - total_penjualan + total_penyesuaian) as stok_sistem,
        COALESCE(stok_fisik_opname, (qty_awal + total_pembelian - total_penjualan + total_penyesuaian)) as stok_fisik,
        stok_minimum
      FROM stok_calc
      ORDER BY nama_produk ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(parseInt(limit), offset);
    const itemsResult = await pool.query(itemsQuery, params);

    return res.status(200).json({
      total_sku: totalSku,
      total_unit: totalUnit,
      stok_rendah: stokRendah,
      items: itemsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalSku,
        totalPages: Math.ceil(totalSku / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('STOK GUDANG API ERROR:', err);
    return res.status(500).json({ error: err.message });
  }
}
