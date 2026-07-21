-- 0016-commissions.sql
-- Standalone commission records: name is free text, no link to tenants/partners.

CREATE TABLE commissions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  amount         REAL NOT NULL,
  paid_date      TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','cheque')),
  cheque_number  TEXT,
  notes          TEXT,
  created_by     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_commissions_paid_date ON commissions(paid_date);
