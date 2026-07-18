-- ============================================
-- Migration: Add Supplier Table and supplier_id Column
-- Date: 2026-07-18
-- Purpose: Ensure supplier table and supplier_id column exist for pembelian feature
-- ============================================

BEGIN;

-- 1. Create supplier table if not exists
CREATE TABLE IF NOT EXISTS supplier (
    id SERIAL PRIMARY KEY,
    kode_supplier VARCHAR(20) UNIQUE,
    nama_supplier VARCHAR(255) NOT NULL,
    alamat TEXT,
    telepon VARCHAR(50),
    pic VARCHAR(100),
    status BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Add supplier_id to pembelian table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pembelian' AND column_name = 'supplier_id'
  ) THEN
    ALTER TABLE pembelian ADD COLUMN supplier_id INTEGER;
    RAISE NOTICE 'Added supplier_id column to pembelian table';
  ELSE
    RAISE NOTICE 'supplier_id column already exists in pembelian table';
  END IF;
END $$;

-- 3. Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_pembelian_supplier ON pembelian (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_kode ON supplier (kode_supplier);
CREATE INDEX IF NOT EXISTS idx_supplier_nama ON supplier (nama_supplier);

-- 4. Add sample suppliers (optional, for testing)
INSERT INTO supplier (kode_supplier, nama_supplier, alamat, telepon, pic) 
SELECT 'SUP001', 'PT Maju Bersama', 'Jl. Industri Raya No. 10, Jakarta', '021-5551234', 'Budi Santoso'
WHERE NOT EXISTS (SELECT 1 FROM supplier WHERE kode_supplier = 'SUP001');

INSERT INTO supplier (kode_supplier, nama_supplier, alamat, telepon, pic) 
SELECT 'SUP002', 'CV Sukses Abadi', 'Jl. Dagang Utama No. 25, Bandung', '022-6662345', 'Ani Wijaya'
WHERE NOT EXISTS (SELECT 1 FROM supplier WHERE kode_supplier = 'SUP002');

INSERT INTO supplier (kode_supplier, nama_supplier, alamat, telepon, pic) 
SELECT 'SUP003', 'Toko Sumber Rejeki', 'Jl. Pasar Baru No. 8, Surabaya', '031-7773456', 'Dewi Kusuma'
WHERE NOT EXISTS (SELECT 1 FROM supplier WHERE kode_supplier = 'SUP003');

COMMIT;
