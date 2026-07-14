import pool from "../services/db.js";

export default async function handler(req, res) {
  const { method } = req;
  
  try {
    switch (method) {
      case 'GET':
        return handleGet(req, res);
      case 'POST':
        return handlePost(req, res);
      case 'PUT':
        return handlePut(req, res);
      case 'DELETE':
        return handleDelete(req, res);
      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Outlet Master API Error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// GET /api/v1/outlet-master - Get all outlets (both active and inactive)
async function handleGet(req, res) {
  const { include_inactive } = req.query;
  
  let query = `
    SELECT 
      om.id,
      om.outlet_id,
      o.nama_outlet,
      om.is_active,
      om.created_at,
      om.updated_at
    FROM outlet_master om
    JOIN outlet o ON o.id = om.outlet_id
  `;
  
  if (include_inactive !== 'true') {
    query += ` WHERE om.is_active = TRUE`;
  }
  
  query += ` ORDER BY o.nama_outlet ASC`;
  
  const result = await pool.query(query);
  
  // Get all outlets for dropdown (outlets not in outlet_master yet)
  const allOutlets = await pool.query(`
    SELECT o.id, o.nama_outlet
    FROM outlet o
    WHERE o.id NOT IN (SELECT outlet_id FROM outlet_master)
    ORDER BY o.nama_outlet ASC
  `);
  
  return res.status(200).json({
    success: true,
    data: {
      outlets: result.rows,
      available_outlets: allOutlets.rows, // Outlets not yet in outlet_master
      total_active: result.rows.filter(r => r.is_active).length,
      total_inactive: include_inactive === 'true' ? result.rows.filter(r => !r.is_active).length : 0
    }
  });
}

// POST /api/v1/outlet-master - Add outlet(s) to master
async function handlePost(req, res) {
  const { outlet_ids, action, changed_by } = req.body;
  
  if (!outlet_ids || !Array.isArray(outlet_ids) || outlet_ids.length === 0) {
    return res.status(400).json({ success: false, message: 'outlet_ids array required' });
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const results = [];
    
    for (const outletId of outlet_ids) {
      // Check if outlet exists
      const outletCheck = await client.query(
        'SELECT nama_outlet FROM outlet WHERE id = $1',
        [outletId]
      );
      
      if (outletCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ 
          success: false, 
          message: `Outlet dengan ID ${outletId} tidak ditemukan` 
        });
      }
      
      const namaOutlet = outletCheck.rows[0].nama_outlet;
      
      // Check if already exists
      const existing = await client.query(
        'SELECT id, is_active FROM outlet_master WHERE outlet_id = $1',
        [outletId]
      );
      
      if (existing.rows.length > 0) {
        if (existing.rows[0].is_active) {
          results.push({ outlet_id: outletId, nama_outlet: namaOutlet, status: 'already_active' });
        } else {
          // Reactivate
          await client.query(
            'UPDATE outlet_master SET is_active = TRUE WHERE outlet_id = $1',
            [outletId]
          );
          await client.query(
            `INSERT INTO outlet_master_log (outlet_id, action, changed_by, note) 
             VALUES ($1, 'reactivate', $2, 'Reactivated from inactive')`,
            [outletId, changed_by || 'system']
          );
          results.push({ outlet_id: outletId, nama_outlet: namaOutlet, status: 'reactivated' });
        }
      } else {
        // Insert new
        await client.query(
          'INSERT INTO outlet_master (outlet_id, is_active) VALUES ($1, TRUE)',
          [outletId]
        );
        await client.query(
          `INSERT INTO outlet_master_log (outlet_id, action, changed_by, note) 
           VALUES ($1, 'add', $2, 'Added to outlet master for July 2025+')`,
          [outletId, changed_by || 'system']
        );
        results.push({ outlet_id: outletId, nama_outlet: namaOutlet, status: 'added' });
      }
    }
    
    await client.query('COMMIT');
    
    return res.status(200).json({
      success: true,
      message: `${results.length} outlet berhasil diproses`,
      data: results
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// PUT /api/v1/outlet-master - Update status (activate/deactivate)
async function handlePut(req, res) {
  const { outlet_id, is_active, changed_by, action } = req.body;
  
  if (!outlet_id) {
    return res.status(400).json({ success: false, message: 'outlet_id required' });
  }
  
  const newStatus = is_active !== undefined ? is_active : true;
  
  // Check if exists
  const existing = await pool.query(
    'SELECT id, outlet_id, is_active FROM outlet_master WHERE outlet_id = $1',
    [outlet_id]
  );
  
  if (existing.rows.length === 0) {
    return res.status(404).json({ 
      success: false, 
      message: 'Outlet tidak ditemukan di outlet master' 
    });
  }
  
  const oldStatus = existing.rows[0].is_active;
  
  if (oldStatus === newStatus) {
    return res.status(200).json({
      success: true,
      message: `Status outlet tidak berubah (sudah ${newStatus ? 'aktif' : 'nonaktif'})`,
      data: { outlet_id, is_active: newStatus }
    });
  }
  
  // Update
  await pool.query(
    'UPDATE outlet_master SET is_active = $1 WHERE outlet_id = $2',
    [newStatus, outlet_id]
  );
  
  // Log
  await pool.query(
    `INSERT INTO outlet_master_log (outlet_id, action, changed_by, note) 
     VALUES ($1, $2, $3, $4)`,
    [outlet_id, action || (newStatus ? 'reactivate' : 'remove'), changed_by || 'system', 
     `Status changed from ${oldStatus} to ${newStatus}`]
  );
  
  return res.status(200).json({
    success: true,
    message: `Outlet berhasil ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}`,
    data: { outlet_id, is_active: newStatus }
  });
}

// DELETE /api/v1/outlet-master - Remove outlet from master
async function handleDelete(req, res) {
  const { outlet_id } = req.body;
  
  if (!outlet_id) {
    return res.status(400).json({ success: false, message: 'outlet_id required' });
  }
  
  const result = await pool.query(
    'DELETE FROM outlet_master WHERE outlet_id = $1 RETURNING id',
    [outlet_id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ 
      success: false, 
      message: 'Outlet tidak ditemukan di outlet master' 
    });
  }
  
  // Log
  await pool.query(
    `INSERT INTO outlet_master_log (outlet_id, action, changed_by, note) 
     VALUES ($1, 'remove', 'system', 'Removed from outlet master')`,
    [outlet_id]
  );
  
  return res.status(200).json({
    success: true,
    message: 'Outlet berhasil dihapus dari outlet master'
  });
}
