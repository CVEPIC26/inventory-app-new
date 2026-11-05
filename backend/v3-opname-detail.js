import pool from "../services/db.js";

// Build WHERE clause based on kategori_id pattern (same as api-stok.js)
function getKategoriWhereClause(kategoriId) {
  switch(kategoriId) {
    case 'modul':
      return `UPPER(p.nama_produk) LIKE '%MODUL%'`;
    case 'poster':
      return `(UPPER(p.nama_produk) LIKE '%POSTER%' OR UPPER(p.nama_produk) LIKE '%FLASHCARD%' OR UPPER(p.nama_produk) LIKE '%FLASH CARD%')`;
    case 'panduan':
      return `UPPER(p.nama_produk) LIKE '%PANDUAN%'`;
    case 'tas':
      return `UPPER(p.nama_produk) LIKE '%TAS%'`;
    case 'seragam':
      return `(UPPER(p.nama_produk) LIKE '%BIRU%' OR UPPER(p.nama_produk) LIKE '%KUNING%' OR UPPER(p.nama_produk) LIKE '%MERAH%' OR UPPER(p.nama_produk) LIKE '%MY%')`;
    case 'lain_lain':
    case 'lain-lain':
      return `(UPPER(p.nama_produk) NOT LIKE '%MODUL%' 
        AND UPPER(p.nama_produk) NOT LIKE '%POSTER%' 
        AND UPPER(p.nama_produk) NOT LIKE '%FLASHCARD%' 
        AND UPPER(p.nama_produk) NOT LIKE '%FLASH CARD%' 
        AND UPPER(p.nama_produk) NOT LIKE '%PANDUAN%' 
        AND UPPER(p.nama_produk) NOT LIKE '%TAS%' 
        AND UPPER(p.nama_produk) NOT LIKE '%BIRU%' 
        AND UPPER(p.nama_produk) NOT LIKE '%KUNING%' 
        AND UPPER(p.nama_produk) NOT LIKE '%MERAH%' 
        AND UPPER(p.nama_produk) NOT LIKE '%MY%')`;
    default:
      return '1=1';
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    if (req.method === 'GET') {
      const { opname_id, kategori_id } = req.query;
      
      if (!opname_id) {
        return res.status(400).json({ success: false, error: "opname_id wajib" });
      }
      
      if (!kategori_id) {
        return res.status(400).json({ success: false, error: "kategori_id required" });
      }
      
      const kategoriWhere = getKategoriWhereClause(kategori_id);
      
      // Calculate stok_sistem from available tables (stok_awal, pembelian, penjualan, penyesuaian)
      const produkList = await pool.query(`
        SELECT
          p.sku,
          p.nama_produk,
          sod.stok_fisik,
          sod.selisih,
          sod.input_at,
          COALESCE(sa.qty_awal, 0) + 
          COALESCE(pb.total_masuk, 0) - 
          COALESCE(pj.total_keluar, 0) +
          COALESCE(sp.total_adjust, 0) as stok_sistem
        FROM produk p
        LEFT JOIN stok_opname_detail sod ON sod.sku = p.sku AND sod.opname_id = $1
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(qty_awal), 0) as qty_awal 
          FROM stok_awal WHERE sku = p.sku
        ) sa ON true
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(qty), 0) as total_masuk 
          FROM pembelian WHERE sku = p.sku
        ) pb ON true
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(qty), 0) as total_keluar 
          FROM penjualan WHERE sku = p.sku
        ) pj ON true
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(qty), 0) as total_adjust 
          FROM stok_penyesuaian WHERE sku = p.sku
        ) sp ON true
        WHERE ${kategoriWhere}
        ORDER BY p.nama_produk
      `, [Number(opname_id)]);
      
      res.status(200).json({
        success: true,
        items: produkList.rows.map(r => ({
          sku: r.sku,
          nama_produk: r.nama_produk,
          stok_sistem: Number(r.stok_sistem || 0),
          stok_fisik: r.stok_fisik,
          selisih: r.selisih,
          input_at: r.input_at
        })),
        total: produkList.rows.length
      });
    }
    
    else if (req.method === 'POST') {
      const { opname_id, sku, stok_fisik } = req.body;
      
      if (!opname_id || !sku || stok_fisik === undefined) {
        return res.status(400).json({ success: false, error: "opname_id, sku, dan stok_fisik wajib diisi" });
      }
      
      // Calculate stok_sistem from available tables
      const stokCalc = await pool.query(`
        SELECT 
          COALESCE((SELECT SUM(qty_awal) FROM stok_awal WHERE sku = $1), 0) +
          COALESCE((SELECT SUM(qty) FROM pembelian WHERE sku = $1), 0) -
          COALESCE((SELECT SUM(qty) FROM penjualan WHERE sku = $1), 0) +
          COALESCE((SELECT SUM(qty) FROM stok_penyesuaian WHERE sku = $1), 0) as stok_sistem
      `, [sku]);
      const stokSistemVal = Number(stokCalc.rows[0]?.stok_sistem || 0);
      const selisih = Number(stok_fisik) - stokSistemVal;
      
      let result;
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        const updateResult = await client.query(`
          UPDATE stok_opname_detail SET stok_fisik = $1, selisih = $2, input_at = NOW()
          WHERE opname_id = $3 AND sku = $4 RETURNING *
        `, [Number(stok_fisik), selisih, Number(opname_id), sku]);
        
        if (updateResult.rows.length > 0) {
          result = updateResult;
        } else {
          result = await client.query(`
            INSERT INTO stok_opname_detail (opname_id, sku, stok_sistem, stok_fisik, selisih, input_at)
            VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *
          `, [Number(opname_id), sku, stokSistemVal, Number(stok_fisik), selisih]);
        }
        
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      
      res.status(200).json({
        success: true,
        detail: result.rows[0],
        message: `Qty fisik untuk ${sku} disimpan. Stok sistem: ${stokSistemVal}, Selisih: ${selisih}`
      });
    }
    
    else {
      res.status(405).json({ success: false, error: "Method not allowed" });
    }
  } catch (err) {
    console.error("V3 OPNAME DETAIL ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
