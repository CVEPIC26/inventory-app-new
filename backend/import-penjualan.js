import pool from "../services/db.js";

// FORMAT TANGGAL (MM/DD/YYYY → YYYY-MM-DD)
function formatTanggal(tgl) {
  if (!tgl) return null;

  if (tgl.includes("/")) {
    const [bulan, hari, tahun] = tgl.split("/");
    return `${tahun}-${bulan.padStart(2, "0")}-${hari.padStart(2, "0")}`;
  }

  return tgl; // sudah format benar
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { csv } = req.body;

    // VALIDASI INPUT
    if (!csv || csv.trim().length === 0) {
      return res.status(400).json({ error: "CSV kosong / tidak terbaca" });
    }

    // CLEAN & SPLIT
    const lines = csv
      .replace(/^\uFEFF/, "") // hapus BOM
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l);

    if (lines.length <= 1) {
      return res.status(400).json({ error: "CSV tidak ada data" });
    }

    const rows = lines.slice(1); // skip header

    let success = 0;
    let failed = 0;

    for (let row of rows) {
      try {
        const cols = row.split(/[,;]/);

        if (cols.length < 4) {
          failed++;
          continue;
        }

        let [tanggal, nama_outlet, sku, qty] = cols.map(c => c.trim());

        if (!tanggal || !nama_outlet || !sku || !qty) {
          failed++;
          continue;
        }

        // FIX qty
        qty = qty.replace("\r", "");

        // VALIDASI SKU
        const cek = await pool.query(
          "SELECT 1 FROM produk WHERE TRIM(sku) = $1",
          [sku]
        );

        if (cek.rows.length === 0) {
          failed++;
          continue;
        }

        const outletName = nama_outlet.toUpperCase();
        const client = await pool.connect();

        try {
          await client.query("BEGIN");

          const insertPenjualan = await client.query(
            `INSERT INTO penjualan (tanggal, nama_outlet, sku, qty)
             VALUES ($1, $2, $3, $4)
             RETURNING id, tanggal, sku, qty`,
            [
              formatTanggal(tanggal),
              outletName,
              sku,
              parseInt(qty)
            ]
          );

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
                "Mirror otomatis dari import penjualan warehouse ke outlet"
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

        success++;

      } catch (errRow) {
        failed++;
      }
    }

    return res.status(200).json({
      message: `Import berhasil (${success} data, ${failed} gagal)`
    });

  } catch (err) {
    console.error("ERROR IMPORT:", err);
    return res.status(500).json({ error: err.message });
  }
}
