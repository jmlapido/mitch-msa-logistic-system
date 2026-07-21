PRAGMA foreign_keys = OFF;

-- Contracts: track early termination (e.g. eviction for non-payment)
-- separately from the contract's originally agreed end_date.
ALTER TABLE contracts ADD COLUMN terminated_at TEXT;
ALTER TABLE contracts ADD COLUMN termination_reason TEXT;

-- rent_payments: add a 'written_off' status. SQLite can't alter a CHECK
-- constraint in place, so recreate the table (same technique as
-- migrations/0006-partial-payments.sql).
CREATE TABLE rent_payments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount REAL NOT NULL,
  amount_paid REAL NOT NULL DEFAULT 0,
  paid_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('collected', 'pending', 'overdue', 'partial', 'written_off')),
  receipt_no TEXT,
  notes TEXT,
  recorded_by INTEGER REFERENCES users(id),
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  payment_method TEXT CHECK(payment_method IN ('cash', 'cheque')),
  written_off_amount REAL,
  written_off_reason TEXT,
  written_off_by INTEGER REFERENCES users(id),
  written_off_at TEXT,
  UNIQUE(contract_id, month)
);

INSERT INTO rent_payments_new
  (id, contract_id, month, amount, amount_paid, paid_date, status, receipt_no, notes, recorded_by, recorded_at, payment_method)
  SELECT id, contract_id, month, amount, amount_paid, paid_date, status, receipt_no, notes, recorded_by, recorded_at, payment_method
  FROM rent_payments;

DROP TABLE rent_payments;
ALTER TABLE rent_payments_new RENAME TO rent_payments;

PRAGMA foreign_keys = ON;
