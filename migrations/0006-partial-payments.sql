-- migrations/0006-partial-payments.sql

-- Recreate rent_payments with 'partial' status and amount_paid column
CREATE TABLE rent_payments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount REAL NOT NULL,
  amount_paid REAL NOT NULL DEFAULT 0,
  paid_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('collected', 'pending', 'overdue', 'partial')),
  receipt_no TEXT,
  notes TEXT,
  recorded_by INTEGER REFERENCES users(id),
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  payment_method TEXT CHECK(payment_method IN ('cash', 'cheque')),
  UNIQUE(contract_id, month)
);

INSERT INTO rent_payments_new
  SELECT id, contract_id, month, amount,
    CASE WHEN status = 'collected' THEN amount ELSE 0 END,
    paid_date, status, receipt_no, notes, recorded_by, recorded_at, payment_method
  FROM rent_payments;

DROP TABLE rent_payments;
ALTER TABLE rent_payments_new RENAME TO rent_payments;

-- payment_entries table (one row per payment event)
CREATE TABLE payment_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rent_payment_id INTEGER NOT NULL REFERENCES rent_payments(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  paid_date TEXT NOT NULL,
  payment_method TEXT CHECK(payment_method IN ('cash', 'cheque')),
  receipt_no TEXT,
  notes TEXT,
  recorded_by TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_payment_entries_rent_payment ON payment_entries(rent_payment_id);
