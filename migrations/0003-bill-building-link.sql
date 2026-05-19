-- migrations/0003-bill-building-link.sql
ALTER TABLE categories ADD COLUMN links_to_building INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bills ADD COLUMN building_id INTEGER REFERENCES buildings(id);
