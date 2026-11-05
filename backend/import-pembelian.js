import pool from "../services/db.js";

function formatTanggal(tgl) {
  if (!tgl) return null;
  if (tgl.includes("/")) {
    const [bulan, hari, tahun] = tgl.split("/");
    return `${tahun}-${bulan.padStart(2, "0")}-${hari.padStart(2, "0")}`;
  }
  return tgl;
}

export default async function handler(req, res) {
  try {
    const csv = req.body?.csv;

    if (!csv || !csv.trim()) {
      return res.status(400).json({ error: "CSV kosong / tidak terbaca" });
    }

    const lines = csv
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    if (lines.length <= 1) {
      return res.status(400).json({ error: "CSV tidak ada data" });
    }

    const rows = lines.slice(1);
    let success = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const [tanggal, sku, qty] = row.split(/[,;]/).map(x => x.trim());

        if (!tanggal || !sku || !qty) {
          failed++;
          continue;
        }

        const qtyAngka = parseInt(qty, 10);
        if (!Number.isFinite(qtyAngka)) {
          failed++;
          continue;
        }

        // Validasi SKU ada di master produk sebelum insert
        const cekSku = await pool.query("SELECT 1 FROM produk WHERE sku = $1", [sku]);
        if (cekSku.rows.length === 0) {
          failed++;
          continue;
        }

        await pool.query(`
          INSERT INTO pembelian (tanggal, sku, qty)
          VALUES ($1,$2,$3)
        `, [formatTanggal(tanggal), sku, qtyAngka]);

        success++;
      } catch {
        failed++;
      }
    }

    res.json({ message: `Import pembelian (${success} data, ${failed} gagal)` });
  } catch (err) {
    console.error("IMPORT PEMBELIAN ERROR:", err);
    res.status(500).json({ error: err.message });
  }
}
