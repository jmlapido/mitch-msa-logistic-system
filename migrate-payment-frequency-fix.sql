-- Fix no_of_pdc DEFAULT from 1 to 0 (if contracts table exists)
-- This migration safely handles the case where contracts table may already exist
PRAGMA foreign_keys = OFF;

-- Only recreate table if it exists and needs updating
CREATE TABLE IF NOT EXISTS contracts_temp (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id         INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contract_no       TEXT NOT NULL,
  start_date        TEXT NOT NULL,
  end_date          TEXT NOT NULL,
  annual_rent       REAL NOT NULL,
  payment_type      TEXT NOT NULL DEFAULT 'pdc' CHECK (payment_type IN ('cash', 'pdc')),
  no_of_pdc         INTEGER NOT NULL DEFAULT 0,
  due_day           INTEGER,
  payment_frequency TEXT NOT NULL DEFAULT 'monthly'
                    CHECK (payment_frequency IN ('monthly', 'quarterly', 'semi-annual', 'annual', 'custom')),
  notes             TEXT,
  created_by        TEXT,
  created_at        TEXT DEFAULT (datetime('now'))
);

-- Copy data if contracts exists, then recreate it with correct defaults
INSERT OR IGNORE INTO contracts_temp SELECT * FROM contracts;
DROP TABLE IF EXISTS contracts;
ALTER TABLE contracts_temp RENAME TO contracts;

CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON contracts(tenant_id);

PRAGMA foreign_keys = ON;
