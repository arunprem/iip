-- Align legacy privileges / privilege_actions tables with iip_core Base audit columns

ALTER TABLE iam.privileges
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE iam.privilege_actions
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
