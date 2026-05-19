-- Users & auth
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK(role IN ('admin','staff')),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- App settings & branding
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Bill categories
CREATE TABLE IF NOT EXISTS categories (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  color             TEXT NOT NULL DEFAULT '#3b82f6',
  icon              TEXT NOT NULL DEFAULT '📋',
  sort_order        INTEGER NOT NULL DEFAULT 0,
  links_to_building INTEGER NOT NULL DEFAULT 0
);

-- Bill-related properties (villas, offices, shops)
CREATE TABLE IF NOT EXISTS properties (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT NOT NULL,
  type    TEXT NOT NULL CHECK(type IN ('villa','office','shop','building','other')),
  address TEXT
);

-- Recurring bill templates
CREATE TABLE IF NOT EXISTS bills (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id  INTEGER NOT NULL REFERENCES categories(id),
  property_id  INTEGER REFERENCES properties(id),
  building_id  INTEGER REFERENCES buildings(id),
  particulars  TEXT NOT NULL,
  account_no   TEXT,
  due_day      INTEGER,
  is_recurring INTEGER NOT NULL DEFAULT 1,
  notes        TEXT,
  created_by   INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Monthly bill records (one per bill per month)
CREATE TABLE IF NOT EXISTS bill_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id     INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  month       TEXT NOT NULL,
  amount      REAL NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'unpaid' CHECK(status IN ('paid','unpaid')),
  -- 'due_soon' is computed at query time from bills.due_day vs current date
  paid_date   TEXT,
  invoice_no  TEXT,
  notes       TEXT,
  updated_by  INTEGER REFERENCES users(id),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(bill_id, month)
);

-- Bill copy/screenshot attachments
CREATE TABLE IF NOT EXISTS bill_attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_entry_id INTEGER NOT NULL REFERENCES bill_entries(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL,
  file_key      TEXT NOT NULL,
  file_size     INTEGER NOT NULL,
  file_type     TEXT NOT NULL,
  uploaded_by   INTEGER REFERENCES users(id),
  uploaded_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rental buildings
CREATE TABLE IF NOT EXISTS buildings (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT NOT NULL,
  type    TEXT NOT NULL CHECK(type IN ('residential','commercial','mixed')),
  address TEXT,
  notes   TEXT
);

-- Units within buildings
CREATE TABLE IF NOT EXISTS units (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  unit_no     TEXT NOT NULL,
  type        TEXT NOT NULL CHECK(type IN ('room','shop','apartment','office','villa')),
  floor       TEXT,
  notes       TEXT
);

-- Tenants
CREATE TABLE IF NOT EXISTS tenants (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  id_number  TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Lease agreements
CREATE TABLE IF NOT EXISTS leases (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id      INTEGER NOT NULL REFERENCES units(id),
  tenant_id    INTEGER NOT NULL REFERENCES tenants(id),
  start_date   TEXT NOT NULL,
  end_date     TEXT NOT NULL,
  monthly_rent REAL NOT NULL,
  deposit      REAL NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','terminated')),
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Monthly rent payment records
CREATE TABLE IF NOT EXISTS rent_payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lease_id    INTEGER NOT NULL REFERENCES leases(id),
  month       TEXT NOT NULL,
  amount      REAL NOT NULL,
  paid_date   TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('collected','pending','overdue')),
  receipt_no  TEXT,
  notes       TEXT,
  recorded_by INTEGER REFERENCES users(id),
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(lease_id, month)
);

-- Rental documents (contract, ID, agreement) for leases/tenants/units
CREATE TABLE IF NOT EXISTS rental_documents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('lease','tenant','unit')),
  entity_id   INTEGER NOT NULL,
  doc_type    TEXT NOT NULL CHECK(doc_type IN ('contract','agreement','id_copy','other')),
  file_name   TEXT NOT NULL,
  file_key    TEXT NOT NULL,
  file_size   INTEGER NOT NULL,
  file_type   TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_bill_entries_month   ON bill_entries(month);
CREATE INDEX IF NOT EXISTS idx_bill_entries_status  ON bill_entries(status);
CREATE INDEX IF NOT EXISTS idx_bills_building       ON bills(building_id);
CREATE INDEX IF NOT EXISTS idx_units_building       ON units(building_id);
CREATE INDEX IF NOT EXISTS idx_leases_unit          ON leases(unit_id);
CREATE INDEX IF NOT EXISTS idx_leases_status        ON leases(status);
CREATE INDEX IF NOT EXISTS idx_rent_payments_month  ON rent_payments(month);
CREATE INDEX IF NOT EXISTS idx_rental_docs_entity   ON rental_documents(entity_type, entity_id);
