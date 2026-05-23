PRAGMA foreign_keys = OFF;
CREATE TABLE units_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  unit_no     TEXT NOT NULL,
  type        TEXT NOT NULL,
  floor       TEXT,
  notes       TEXT
);
INSERT INTO units_new SELECT id, building_id, unit_no, type, floor, notes FROM units;
DROP TABLE units;
ALTER TABLE units_new RENAME TO units;
CREATE INDEX IF NOT EXISTS idx_units_building ON units(building_id);
PRAGMA foreign_keys = ON;
INSERT OR IGNORE INTO settings (key, value) VALUES ('unit_types', '["room","shop","apartment","office","villa"]');
