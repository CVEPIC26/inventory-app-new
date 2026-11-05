import pool from "../services/db.js";

export default async function handler(req, res) {
  try {
    const { sku, qty } = req.body;

    // Normalisasi & validasi input
    const skuBersih = String(sku || "").trim();
    const qtyAngka = parseInt(qty, 10);

    if (!skuBersih || !Number.isFinite(qtyAngka)) {
      return res.status(400).json({ error: "Data tidak lengkap atau qty tidak valid" });
    }

    // Cek apakah SKU ada di master produk
    const cekSku = await pool.query("SELECT 1 FROM produk WHERE sku = $1", [skuBersih]);
    if (cekSku.rows.length === 0) {
      return res.status(400).json({ error: "SKU tidak ditemukan di master produk" });
    }

    await pool.query(`
      INSERT INTO stok_awal (sku, qty_awal)
      VALUES ($1,$2)
    `, [skuBersih, qtyAngka]);

    res.status(200).json({ message: "Stok awal berhasil" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}