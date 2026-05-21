-- Track legacy unit.id for imports and reconciliation
ALTER TABLE iam.offices
    ADD COLUMN IF NOT EXISTS legacy_unit_id INTEGER UNIQUE;

CREATE INDEX IF NOT EXISTS idx_offices_legacy_unit_id ON iam.offices (legacy_unit_id);
