-- migrations/0018-withdrawals.sql

-- Withdrawals: standalone owner/family draw records (free-text withdrawn_by, no FK)
CREATE TABLE withdrawals (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  withdrawn_by   TEXT NOT NULL,
  amount         REAL NOT NULL,
  withdrawn_date TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','cheque')),
  cheque_number  TEXT,
  notes          TEXT,
  created_by     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_withdrawals_date ON withdrawals(withdrawn_date);
