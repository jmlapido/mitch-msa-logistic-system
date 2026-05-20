-- migrations/0007-partners.sql

CREATE TABLE partners (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL,
  phone        TEXT,
  email        TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE partner_contacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   TEXT,
  phone      TEXT
);

CREATE TABLE partner_contracts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id        INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  start_date        TEXT NOT NULL,
  end_date          TEXT NOT NULL,
  expected_amount   REAL NOT NULL,
  payment_frequency TEXT NOT NULL CHECK(payment_frequency IN ('monthly','quarterly','annual','one-time')),
  notes             TEXT,
  status            TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','terminated')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE partner_payments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id     INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  contract_id    INTEGER NOT NULL REFERENCES partner_contracts(id) ON DELETE CASCADE,
  amount         REAL NOT NULL,
  paid_date      TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','cheque')),
  receipt_no     TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE partner_payment_attachments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id  INTEGER NOT NULL REFERENCES partner_payments(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  file_key    TEXT NOT NULL,
  file_size   INTEGER NOT NULL,
  file_type   TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE partner_documents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id  INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  doc_type    TEXT NOT NULL CHECK(doc_type IN ('contract','agreement','other')),
  file_name   TEXT NOT NULL,
  file_key    TEXT NOT NULL,
  file_size   INTEGER NOT NULL,
  file_type   TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_partner_contacts_partner   ON partner_contacts(partner_id);
CREATE INDEX idx_partner_contracts_partner  ON partner_contracts(partner_id);
CREATE INDEX idx_partner_payments_partner   ON partner_payments(partner_id);
CREATE INDEX idx_partner_payments_contract  ON partner_payments(contract_id);
CREATE INDEX idx_partner_pay_att_payment    ON partner_payment_attachments(payment_id);
CREATE INDEX idx_partner_docs_partner       ON partner_documents(partner_id);
