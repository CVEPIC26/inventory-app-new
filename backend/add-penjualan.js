import pool from "../services/db.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { tanggal, nama_outlet, sku, qty } = req.body;

    // Normalisasi & validasi input
    const tanggalBersih = String(tanggal || "").trim();
    const namaOutletBersih = String(nama_outlet || "").trim().toUpperCase();
    const skuBersih = String(sku || "").trim();
    const qtyAngka = parseInt(qty, 10);

    if (!tanggalBersih || !namaOutletBersih || !skuBersih || !Number.isFinite(qtyAngka)) {
      return res.status(400).json({ error: "Data tidak lengkap atau qty tidak valid" });
    }

    // Cek apakah SKU ada
    const cek = await pool.query("SELECT * FROM produk WHERE sku = $1", [skuBersih]);

    if (cek.rows.length === 0) {
      return res.status(400).json({ error: "SKU tidak ditemukan" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const insertPenjualan = await client.query(`
        INSERT INTO penjualan (tanggal, nama_outlet, sku, qty)
        VALUES ($1, $2, $3, $4)
        RETURNING id, tanggal, nama_outlet, sku, qty
      `, [tanggalBersih, namaOutletBersih, skuBersih, qtyAngka]);

      const availability = await client.query(`
        SELECT
          to_regclass('public.outlet_stok_masuk') IS NOT NULL AS has_outlet_stok_masuk,
          to_regclass('public.outlet') IS NOT NULL AS has_outlet
      `);

      if (availability.rows[0]?.has_outlet_stok_masuk && availability.rows[0]?.has_outlet) {
        await client.query(`
          INSERT INTO outlet (nama_outlet)
          VALUES ($1)
          ON CONFLICT (nama_outlet) DO NOTHING
        `, [outletName]);

        const outletResult = await client.query(`
          SELECT id
          FROM outlet
          WHERE nama_outlet = $1
          LIMIT 1
        `, [outletName]);

        const outletId = outletResult.rows[0]?.id;
        const ref = insertPenjualan.rows[0];

        if (outletId) {
          await client.query(`
            INSERT INTO outlet_stok_masuk (tanggal, outlet_id, sku, qty, sumber, ref_penjualan_id, keterangan)
            VALUES ($1, $2, $3, $4, 'warehouse_sale_auto', $5, $6)
          `, [
            ref.tanggal,
            outletId,
            ref.sku,
            ref.qty,
            ref.id,
            "Mirror otomatis dari penjualan warehouse ke outlet"
          ]);
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    res.status(200).json({ message: "Berhasil ditambahkan" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
