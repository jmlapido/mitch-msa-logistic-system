-- 0015-tenant-profile-first.sql
-- Tenant profile-first redesign: the contract (not the tenant) links to a unit,
-- and tenants become standalone person/company profiles.
--
-- NOTE: assumes the deployed DB state where tenants.unit_id exists (added ad hoc
-- outside schema.sql) and the contracts table exists (migrate-payment-frequency.sql).
-- Fresh bootstraps should use schema.sql (already post-0015) and skip this file.

-- 1. Contracts become the tenant<->unit link
ALTER TABLE contracts ADD COLUMN unit_id INTEGER REFERENCES units(id);
CREATE INDEX IF NOT EXISTS idx_contracts_unit ON contracts(unit_id);

-- 2. Backfill: copy each tenant's current unit onto all of their contracts.
--    Archived tenants already had unit_id wiped, so their contracts stay NULL
--    (decided: legacy contracts show "unit not recorded").
UPDATE contracts
SET unit_id = (SELECT unit_id FROM tenants WHERE tenants.id = contracts.tenant_id);

-- 3. Tenant profile: drop the unit link, add person/company fields
ALTER TABLE tenants DROP COLUMN unit_id;

ALTER TABLE tenants ADD COLUMN tenant_type TEXT NOT NULL DEFAULT 'person'
  CHECK (tenant_type IN ('person','company'));
ALTER TABLE tenants ADD COLUMN phone_alt TEXT;
ALTER TABLE tenants ADD COLUMN address TEXT;
ALTER TABLE tenants ADD COLUMN nationality TEXT;
ALTER TABLE tenants ADD COLUMN trade_license_no TEXT;
ALTER TABLE tenants ADD COLUMN trn TEXT;
ALTER TABLE tenants ADD COLUMN contact_person_name TEXT;
ALTER TABLE tenants ADD COLUMN contact_person_phone TEXT;
ALTER TABLE tenants ADD COLUMN contact_person_email TEXT;
