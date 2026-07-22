import pool from "../services/db.js";
import { kategoriLabel } from "./opname-kategori-utils.js";

function normalizeKodeSo(value) {
  return String(value || "").trim().toUpperCase();
}

// Count target SKU based on kategori_id using the same pattern as api-stok.js
async function countTargetSkuByKategori(kategoriId) {
  try {
    let whereClause = "";
    
    switch(kategoriId) {
      case 'modul':
        whereClause = "WHERE UPPER(nama_produk) LIKE '%MODUL%'";
        break;
      case 'poster':
        whereClause = "WHERE UPPER(nama_produk) LIKE '%POSTER%' OR UPPER(nama_produk) LIKE '%FLASHCARD%' OR UPPER(nama_produk) LIKE '%FLASH CARD%'";
        break;
      case 'panduan':
        whereClause = "WHERE UPPER(nama_produk) LIKE '%PANDUAN%'";
        break;
      case 'tas':
        whereClause = "WHERE UPPER(nama_produk) LIKE '%TAS%'";
        break;
      case 'seragam':
        whereClause = "WHERE UPPER(nama_produk) LIKE '%BIRU%' OR UPPER(nama_produk) LIKE '%KUNING%' OR UPPER(nama_produk) LIKE '%MERAH%' OR UPPER(nama_produk) LIKE '%MY%'";
        break;
      case 'lain_lain':
      case 'lain-lain':
        whereClause = `WHERE UPPER(nama_produk) NOT LIKE '%MODUL%' 
          AND UPPER(nama_produk) NOT LIKE '%POSTER%' 
          AND UPPER(nama_produk) NOT LIKE '%FLASHCARD%' 
          AND UPPER(nama_produk) NOT LIKE '%FLASH CARD%' 
          AND UPPER(nama_produk) NOT LIKE '%PANDUAN%' 
          AND UPPER(nama_produk) NOT LIKE '%TAS%' 
          AND UPPER(nama_produk) NOT LIKE '%BIRU%' 
          AND UPPER(nama_produk) NOT LIKE '%KUNING%' 
          AND UPPER(nama_produk) NOT LIKE '%MERAH%' 
          AND UPPER(nama_produk) NOT LIKE '%MY%'`;
        break;
      default:
        whereClause = "";
    }
    
    const result = await pool.query(`SELECT COUNT(*)::int as total FROM produk ${whereClause}`);
    return Number(result.rows[0]?.total || 0);
  } catch (error) {
    console.error('Error counting target SKU:', error);
    return 0;
  }
}

async function calculateProgress(opnameId, kategoriId, storedTargetSku) {
  // Get dynamic target SKU based on kategori
  const targetSku = storedTargetSku > 0 ? storedTargetSku : await countTargetSkuByKategori(kategoriId);
  
  if (!opnameId) {
    return { target_sku: targetSku, checked_sku: 0, progress_percent: 0 };
  }
  
  try {
    const result = await pool.query(`
      SELECT COUNT(DISTINCT sku)::int AS checked
      FROM stok_opname_detail
      WHERE opname_id = $1
    `, [opnameId]);
    
    const checked = Number(result.rows[0]?.checked || 0);
    const progress = targetSku > 0 ? Math.round((checked / targetSku) * 100) : 0;
    
    return { target_sku: targetSku, checked_sku: checked, progress_percent: progress };
  } catch (error) {
    console.error('Error calculating progress:', error);
    return { target_sku: targetSku, checked_sku: 0, progress_percent: 0 };
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { id, kode_so, bulan, tahun } = req.query;

      if (id || kode_so) {
        const result = await pool.query(
          `SELECT * FROM stok_opname_perintah WHERE ${id ? "id = $1" : "UPPER(kode_so) = $1"} LIMIT 1`,
          [id ? Number(id) : normalizeKodeSo(kode_so)]
        );

        if (!result.rows.length) {
          return res.status(404).json({ error: "Perintah SO tidak ditemukan" });
        }

        const row = result.rows[0];
        const progress = await calculateProgress(row.opname_id, row.kategori_id, row.target_sku);
        
        return res.status(200).json({
          id: row.id,
          kode_so: row.kode_so,
          kategori_id: row.kategori_id,
          kategori_nama: kategoriLabel(row.kategori_id),
          target_sku: progress.target_sku,
          checked_sku: progress.checked_sku,
          progress_percent: progress.progress_percent,
          status: row.status,
          pic_checker: row.pic_checker,
          checker: row.checker,
          svp_nama: row.svp_nama,
          lokasi: row.lokasi,
          keterangan: row.keterangan,
          tanggal_perintah: row.tanggal_perintah,
          bulan: row.bulan,
          tahun: row.tahun,
          opname_id: row.opname_id,
          created_at: row.created_at,
          started_at: row.started_at,
          completed_at: row.completed_at
        });
      }

      if (!bulan || !tahun) {
        return res.status(400).json({ error: "bulan & tahun wajib" });
      }

      const listResult = await pool.query(
        `SELECT * FROM stok_opname_perintah WHERE bulan = $1 AND tahun = $2 ORDER BY created_at DESC, kode_so ASC`,
        [Number(bulan), Number(tahun)]
      );

      const items = await Promise.all(listResult.rows.map(async (row) => {
        const progress = await calculateProgress(row.opname_id, row.kategori_id, row.target_sku);
        return {
          id: row.id,
          kode_so: row.kode_so,
          kategori_id: row.kategori_id,
          kategori_nama: kategoriLabel(row.kategori_id),
          target_sku: progress.target_sku,
          checked_sku: progress.checked_sku,
          progress_percent: progress.progress_percent,
          status: row.status,
          pic_checker: row.pic_checker,
          checker: row.checker,
          svp_nama: row.svp_nama,
          lokasi: row.lokasi,
          keterangan: row.keterangan,
          tanggal_perintah: row.tanggal_perintah,
          bulan: row.bulan,
          tahun: row.tahun,
          opname_id: row.opname_id,
          created_at: row.created_at,
          started_at: row.started_at,
          completed_at: row.completed_at
        };
      }));

      console.log("[SO LIST]", { bulan, tahun, count: items.length });

      // Get problematic products (selisih != 0) from completed SO in this period
      let produkBermasalah = [];
      try {
        const problematicResult = await pool.query(`
          SELECT DISTINCT 
            d.sku,
            p.nama_produk,
            d.stok_sistem,
            d.stok_fisik,
            d.selisih,
            sop.kode_so,
            sop.bulan,
            sop.tahun
          FROM stok_opname_detail d
          JOIN stok_opname so ON so.id = d.opname_id
          JOIN stok_opname_perintah sop ON sop.opname_id = so.id
          WHERE sop.bulan = $1 
            AND sop.tahun = $2
            AND sop.status = 'selesai'
            AND d.selisih != 0
          ORDER BY ABS(d.selisih) DESC, d.sku ASC
          LIMIT 20
        `, [Number(bulan), Number(tahun)]);
        
        produkBermasalah = problematicResult.rows.map(row => ({
          sku: row.sku,
          nama_produk: row.nama_produk,
          stok_sistem: Number(row.stok_sistem || 0),
          stok_fisik: Number(row.stok_fisik || 0),
          selisih: Number(row.selisih || 0),
          kode_so: row.kode_so
        }));
      } catch (err) {
        console.error('Error fetching produk bermasalah:', err.message);
      }

      return res.status(200).json({ success: true, items, produk_bermasalah: produkBermasalah });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const action = String(body.action || "create").toLowerCase();

      if (action === "start") {
        const perintahId = Number(body.perintah_id);
        if (!perintahId) {
          return res.status(400).json({ error: "perintah_id wajib" });
        }

        const result = await pool.query(
          `UPDATE stok_opname_perintah SET status = 'proses', checker = COALESCE(NULLIF($2, ''), checker), started_at = COALESCE(started_at, NOW()), updated_at = NOW() WHERE id = $1 AND status IN ('menunggu', 'proses') RETURNING *`,
          [perintahId, body.pic_checker || body.checker || null]
        );

        if (!result.rows.length) {
          return res.status(404).json({ error: "Perintah SO tidak ditemukan atau sudah selesai" });
        }

        return res.status(200).json(result.rows[0]);
      }

      if (action === "update") {
        const perintahId = Number(body.perintah_id);
        if (!perintahId) {
          return res.status(400).json({ error: "perintah_id wajib" });
        }

        const kodeSo = normalizeKodeSo(body.kode_so);
        const kategoriId = body.kategori_id;
        const picChecker = body.pic_checker;
        const svpNama = String(body.svp_nama || "").trim();
        const lokasi = String(body.lokasi || "").trim() || null;
        const keterangan = String(body.keterangan || "").trim() || null;
        const tanggal = body.tanggal_perintah || body.tanggal;

        if (!kodeSo || !svpNama || !tanggal || !kategoriId) {
          return res.status(400).json({ error: "kode_so, kategori_id, svp_nama, dan tanggal wajib diisi" });
        }

        const dateObj = new Date(tanggal);
        if (Number.isNaN(dateObj.getTime())) {
          return res.status(400).json({ error: "Format tanggal tidak valid" });
        }

        const bulan = Number(body.bulan) || dateObj.getMonth() + 1;
        const tahun = Number(body.tahun) || dateObj.getFullYear();

        // Get dynamic target SKU based on produk table pattern
        const targetSku = await countTargetSkuByKategori(kategoriId);

        const updateResult = await pool.query(
          `UPDATE stok_opname_perintah SET kode_so = $1, kategori_id = $2, kategori_nama = $3, pic_checker = $4, tanggal_perintah = $5, bulan = $6, tahun = $7, svp_nama = $8, lokasi = $9, keterangan = $10, target_sku = $11, checker = COALESCE(NULLIF($12, ''), checker), updated_at = NOW() WHERE id = $13 RETURNING *`,
          [kodeSo, kategoriId, kategoriLabel(kategoriId), picChecker, tanggal, bulan, tahun, svpNama, lokasi, keterangan, targetSku, picChecker, perintahId]
        );

        if (!updateResult.rows.length) {
          return res.status(400).json({ error: "Perintah tidak dapat diperbarui" });
        }

        return res.status(200).json({ message: `Perintah ${kodeSo} berhasil diperbarui`, perintah: updateResult.rows[0] });
      }

      // CREATE
      const kodeSo = normalizeKodeSo(body.kode_so);
      const kategoriId = body.kategori_id || 'modul';
      const picChecker = body.pic_checker;
      const svpNama = String(body.svp_nama || "").trim();
      const lokasi = String(body.lokasi || "").trim() || null;
      const keterangan = String(body.keterangan || "").trim() || null;
      const tanggal = body.tanggal_perintah || body.tanggal;

      if (!kodeSo || !svpNama || !tanggal) {
        return res.status(400).json({ error: "kode_so, svp_nama, dan tanggal wajib diisi" });
      }

      const dateObj = new Date(tanggal);
      if (Number.isNaN(dateObj.getTime())) {
        return res.status(400).json({ error: "Format tanggal tidak valid" });
      }

      const bulan = Number(body.bulan) || dateObj.getMonth() + 1;
      const tahun = Number(body.tahun) || dateObj.getFullYear();

      // Get dynamic target SKU based on produk table pattern
      const targetSku = await countTargetSkuByKategori(kategoriId);

      const insertResult = await pool.query(
        `INSERT INTO stok_opname_perintah (kode_so, kategori_id, kategori_nama, pic_checker, tanggal_perintah, bulan, tahun, svp_nama, checker, lokasi, keterangan, target_sku, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'menunggu') RETURNING *`,
        [kodeSo, kategoriId, kategoriLabel(kategoriId), picChecker, tanggal, bulan, tahun, svpNama, picChecker, lokasi, keterangan, targetSku]
      );

      return res.status(201).json({ message: `Perintah ${kodeSo} berhasil dibuat`, perintah: insertResult.rows[0] });
    }
    
    if (req.method === "DELETE") {
      const auth = await import('../services/auth.js');
      const authResult = auth.authenticate(req);
      if (!authResult.authorized) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (authResult.user.role !== 'admin') {
        return res.status(403).json({ error: "Hanya admin yang dapat menghapus" });
      }
      
      const url = new URL(req.url, `http://${req.headers.host}`);
      const pathParts = url.pathname.split('/').filter(Boolean);
      const idIndex = pathParts.findIndex(p => p === 'opname-perintah');
      const id = pathParts[idIndex + 1];
      
      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ error: "ID tidak valid" });
      }
      
      const checkResult = await pool.query(`SELECT id, kode_so, status FROM stok_opname_perintah WHERE id = $1`, [id]);
      
      if (!checkResult.rows.length) {
        return res.status(404).json({ error: "Perintah tidak ditemukan" });
      }
      
      const perintah = checkResult.rows[0];
      
      if (perintah.status !== 'menunggu') {
        return res.status(400).json({ error: `Tidak dapat menghapus perintah dengan status "${perintah.status}"` });
      }
      
      await pool.query(`DELETE FROM stok_opname_perintah WHERE id = $1`, [id]);
      
      return res.status(200).json({ message: `Perintah ${perintah.kode_so} berhasil dihapus` });
    }

    return res.status(405).json({ error: "Method tidak diizinkan" });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Kode SO sudah digunakan" });
    }
    console.error("OPNAME PERINTAH ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
}
