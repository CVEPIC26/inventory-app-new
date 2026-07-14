-- Migration 007: Outlet Master untuk kontrol manual mulai Juli 2025
-- Fungsi: Tabel untuk menentukan daftar outlet yang aktif mulai Juli 2025+
-- Data Jan-Juni 2025 tetap menggunakan logika existing (dari penjualan)

-- Tabel utama untuk outlet manual
CREATE TABLE IF NOT EXISTS outlet_master (
  id SERIAL PRIMARY KEY,
  outlet_id INTEGER NOT NULL REFERENCES outlet(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (outlet_id)
);

-- Index untuk query cepat
CREATE INDEX IF NOT EXISTS idx_outlet_master_active ON outlet_master (is_active) WHERE is_active = TRUE;

-- Tabel log untuk tracking perubahan
CREATE TABLE IF NOT EXISTS outlet_master_log (
  id SERIAL PRIMARY KEY,
  outlet_id INTEGER NOT NULL REFERENCES outlet(id),
  action VARCHAR(20) NOT NULL, -- 'add', 'remove', 'reactivate'
  changed_by VARCHAR(100),
  changed_at TIMESTAMP DEFAULT NOW(),
  note TEXT
);

-- Function untuk auto-update updated_at
CREATE OR REPLACE FUNCTION update_outlet_master_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger untuk auto-update timestamp
DROP TRIGGER IF EXISTS trg_outlet_master_updated ON outlet_master;
CREATE TRIGGER trg_outlet_master_updated
  BEFORE UPDATE ON outlet_master
  FOR EACH ROW
  EXECUTE FUNCTION update_outlet_master_timestamp();

-- Komentar untuk dokumentasi
COMMENT ON TABLE outlet_master IS 'Master outlet yang aktif mulai Juli 2025+. Untuk Jan-Juni 2025 tetap pakai logika dari penjualan.';
COMMENT ON COLUMN outlet_master.outlet_id IS 'Reference ke tabel outlet.id';
COMMENT ON COLUMN outlet_master.is_active IS 'TRUE = outlet aktif di periode Juli+, FALSE = dinonaktifkan';
