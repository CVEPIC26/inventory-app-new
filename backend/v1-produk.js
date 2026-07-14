import pool from "../services/db.js";

export default async function handler(req, res) {
  const method = req.method;
  const url = new URL(req.url, "http://localhost");
  const pathParts = url.pathname.split('/').filter(Boolean);
  
  // Extract ID from path (last part) - SKU is used as identifier
  const skuFromPath = pathParts[pathParts.length - 1];
  
  try {
    switch (method) {
      case 'GET': {
        // GET /v1/produk or GET /v1/produk/:sku
        if (skuFromPath && skuFromPath !== 'produk') {
          return getProdukBySku(req, res, skuFromPath);
        }
        return getAllProduk(req, res);
      }
      
      case 'POST': {
        // POST /v1/produk - Create new produk
        return createProduk(req, res);
      }
      
      case 'PUT': {
        // PUT /v1/produk/:sku - Update produk
        if (skuFromPath && skuFromPath !== 'produk') {
          return updateProduk(req, res, skuFromPath);
        }
        return res.status(400).json({ error: 'SKU is required for update' });
      }
      
      case 'DELETE': {
        // DELETE /v1/produk/:sku - Delete produk
        if (skuFromPath && skuFromPath !== 'produk') {
          return deleteProduk(req, res, skuFromPath);
        }
        return res.status(400).json({ error: 'SKU is required for delete' });
      }
      
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('PRODUK API ERROR:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Debug: Simple test endpoint
async function testHandler(req, res) {
  return res.status(200).json({ message: 'Test OK' });
}

async function getAllProduk(req, res) {
  const { search, kategori, page = 1, limit = 50 } = req.query || {};
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
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
  
  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM produk p ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count);
  
  // Get produk with simple query (no stock calculation to avoid timeout)
  const query = `
    SELECT 
      p.sku as id,
      p.sku,
      p.nama_produk,
      COALESCE(p.kategori, 'lain_lain') as kategori,
      COALESCE(p.stok_minimum, 10) as stok_minimum,
      p.harga_beli,
      p.harga_jual,
      p.created_at,
      0 as stok
    FROM produk p
    ${whereClause}
    ORDER BY p.nama_produk ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  
  params.push(parseInt(limit), offset);
  
  const result = await pool.query(query, params);
  
  return res.status(200).json({
    success: true,
    produk: result.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit))
    }
  });
}

async function getProdukBySku(req, res, sku) {
  const query = `
    SELECT 
      p.sku as id,
      p.sku,
      p.nama_produk,
      COALESCE(p.kategori, 'lain_lain') as kategori,
      COALESCE(p.stok_minimum, 10) as stok_minimum,
      p.harga_beli,
      p.harga_jual,
      p.created_at,
      0 as stok
    FROM produk p
    WHERE p.sku = $1
  `;
  
  const result = await pool.query(query, [sku]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Produk not found' });
  }
  
  return res.status(200).json(result.rows[0]);
}

async function createProduk(req, res) {
  const { sku, nama_produk, kategori, stok_minimum, harga_beli, harga_jual } = req.body || {};
  
  if (!sku || !nama_produk) {
    return res.status(400).json({ error: 'SKU and Nama are required' });
  }
  
  // Check if SKU already exists
  const existing = await pool.query('SELECT sku FROM produk WHERE sku = $1', [sku]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'SKU already exists' });
  }
  
  const query = `
    INSERT INTO produk (sku, nama_produk, kategori, stok_minimum, harga_beli, harga_jual)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  
  const values = [
    sku,
    nama_produk,
    kategori || 'lain_lain',
    stok_minimum || 10,
    harga_beli || 0,
    harga_jual || 0
  ];
  
  const result = await pool.query(query, values);
  
  return res.status(201).json({
    message: 'Produk created successfully',
    data: result.rows[0]
  });
}

async function updateProduk(req, res, sku) {
  const { nama_produk, kategori, stok_minimum, harga_beli, harga_jual } = req.body || {};
  
  // Check if produk exists
  const existing = await pool.query('SELECT sku FROM produk WHERE sku = $1', [sku]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: 'Produk not found' });
  }
  
  const updates = [];
  const values = [];
  let paramIndex = 1;
  
  if (nama_produk !== undefined) {
    updates.push(`nama_produk = $${paramIndex}`);
    values.push(nama_produk);
    paramIndex++;
  }
  
  if (kategori !== undefined) {
    updates.push(`kategori = $${paramIndex}`);
    values.push(kategori);
    paramIndex++;
  }
  
  if (stok_minimum !== undefined) {
    updates.push(`stok_minimum = $${paramIndex}`);
    values.push(stok_minimum);
    paramIndex++;
  }
  
  if (harga_beli !== undefined) {
    updates.push(`harga_beli = $${paramIndex}`);
    values.push(harga_beli);
    paramIndex++;
  }
  
  if (harga_jual !== undefined) {
    updates.push(`harga_jual = $${paramIndex}`);
    values.push(harga_jual);
    paramIndex++;
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  
  values.push(sku);
  
  const query = `
    UPDATE produk 
    SET ${updates.join(', ')}
    WHERE sku = $${paramIndex}
    RETURNING *
  `;
  
  const result = await pool.query(query, values);
  
  return res.status(200).json({
    message: 'Produk updated successfully',
    data: result.rows[0]
  });
}

async function deleteProduk(req, res, sku) {
  // Check if produk exists
  const existing = await pool.query('SELECT sku FROM produk WHERE sku = $1', [sku]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: 'Produk not found' });
  }
  
  // Check if produk is used in transactions
  const usage = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM penjualan WHERE sku = $1) +
      (SELECT COUNT(*) FROM pembelian WHERE sku = $1) +
      (SELECT COUNT(*) FROM stok_awal WHERE sku = $1) as usage_count
  `, [sku]);
  
  if (parseInt(usage.rows[0].usage_count) > 0) {
    return res.status(409).json({ 
      error: 'Produk cannot be deleted because it is used in transactions',
      usage_count: parseInt(usage.rows[0].usage_count)
    });
  }
  
  await pool.query('DELETE FROM produk WHERE sku = $1', [sku]);
  
  return res.status(200).json({ message: 'Produk deleted successfully' });
}
