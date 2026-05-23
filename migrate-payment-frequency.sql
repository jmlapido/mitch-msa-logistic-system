-- migrate-payment-frequency.sql
PRAGMA foreign_keys = OFF;

CREATE TABLE contracts_new (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id         INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contract_no       TEXT NOT NULL,
  start_date        TEXT NOT NULL,
  end_date          TEXT NOT NULL,
  annual_rent       REAL NOT NULL,
  no_of_pdc         INTEGER NOT NULL DEFAULT 1,
  notes             TEXT,
  created_by        INTEGER REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  payment_type      TEXT NOT NULL DEFAULT 'pdc' CHECK (payment_type IN ('cash', 'pdc')),
  due_day           INTEGER,
  payment_frequency TEXT NOT NULL DEFAULT 'monthly'
                    CHECK (payment_frequency IN ('monthly', 'quarterly', 'semi-annual', 'annual', 'custom'))
);

INSERT INTO contracts_new SELECT * FROM contracts;
DROP TABLE contracts;
ALTER TABLE contracts_new RENAME TO contracts;

CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON contracts(tenant_id);

PRAGMA foreign_keys = ON;
