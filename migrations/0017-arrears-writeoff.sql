-- Contracts: track early termination (e.g. eviction for non-payment)
-- separately from the contract's originally agreed end_date.
ALTER TABLE contracts ADD COLUMN terminated_at TEXT;
ALTER TABLE contracts ADD COLUMN termination_reason TEXT;

-- payment_entries: drop its `REFERENCES rent_payments(id) ON DELETE CASCADE`
-- declaration BEFORE rent_payments is dropped/recreated below. D1's migration
-- runner executes this whole file as one atomic batch, so `PRAGMA
-- foreign_keys = OFF` cannot be made to take effect (confirmed by direct
-- testing, not an assumption) — with the FK still declared, the DROP TABLE
-- rent_payments step below would perform SQLite's documented implicit-delete
-- behavior and cascade-wipe every payment_entries row. This must run first,
-- so that by the time rent_payments is dropped, nothing references it.
-- Cascade-delete safety is replaced by explicit deletes in application code
-- (src/routes/contracts.ts, src/routes/tenants.ts, src/index.ts's scheduled
-- purge) instead of a DB-level constraint.
--
-- source_entry_id also drops its self-referencing `REFERENCES
-- payment_entries(id)` declaration, for a subtler version of the same
-- problem: FK references resolve by table name, so while this table is
-- still named payment_entries_new, its own copied rows' source_entry_id
-- values are checked against whatever table is *currently* named
-- payment_entries — the OLD table, until the rename below. Dropping that old
-- table would then violate this table's own not-yet-renamed FK. Confirmed by
-- direct testing against seeded self-referencing rows, not an assumption.
-- No app code relies on this one cascading (it's a read-only audit trail
-- link, checked directly in rent-payments.ts, never deleted-through).
CREATE TABLE payment_entries_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rent_payment_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  paid_date TEXT NOT NULL,
  payment_method TEXT CHECK(payment_method IN ('cash', 'cheque')),
  receipt_no TEXT,
  notes TEXT,
  recorded_by TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  source_entry_id INTEGER
);

INSERT INTO payment_entries_new
  (id, rent_payment_id, amount, paid_date, payment_method, receipt_no, notes, recorded_by, recorded_at, source_entry_id)
  SELECT id, rent_payment_id, amount, paid_date, payment_method, receipt_no, notes, recorded_by, recorded_at, source_entry_id
  FROM payment_entries;

DROP TABLE payment_entries;
ALTER TABLE payment_entries_new RENAME TO payment_entries;

-- rent_payments: add a 'written_off' status. SQLite can't alter a CHECK
-- constraint in place, so recreate the table (same technique as
-- migrations/0006-partial-payments.sql).
--
-- contract_id also drops its `REFERENCES contracts(id) ON DELETE CASCADE`
-- declaration for the same reason as payment_entries above: production has
-- 91 legacy rent_payments rows whose contract_id no longer matches any
-- contracts.id (orphaned before this migration, never previously
-- re-validated since a static FK declaration isn't checked against data
-- already at rest), and FK enforcement cannot be disabled for this INSERT.
CREATE TABLE rent_payments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
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
