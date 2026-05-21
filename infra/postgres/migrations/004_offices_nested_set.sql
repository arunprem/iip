-- Office hierarchy using nested set model (aligned with legacy unit table)
-- Run after 002_iam_privileges_menus_offices.sql

ALTER TABLE iam.offices
    ADD COLUMN IF NOT EXISTS ncrb_id VARCHAR(20),
    ADD COLUMN IF NOT EXISTS office_short_code VARCHAR(100),
    ADD COLUMN IF NOT EXISTS office_type_id INTEGER,
    ADD COLUMN IF NOT EXISTS head_rank INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_parent_unit BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS district_id INTEGER,
    ADD COLUMN IF NOT EXISTS list_order INTEGER,
    ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES iam.offices(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS lft INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS rgt INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS hlevel INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS root_id UUID REFERENCES iam.offices(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_offices_parent ON iam.offices (parent_id);
CREATE INDEX IF NOT EXISTS idx_offices_nested ON iam.offices (root_id, lft);
CREATE INDEX IF NOT EXISTS idx_offices_lft_rgt ON iam.offices (lft, rgt);

-- Initialize existing rows as single-node trees if not yet set
DO $$
DECLARE
    rec RECORD;
    pos INTEGER := 1;
BEGIN
    FOR rec IN
        SELECT id FROM iam.offices
        WHERE lft = 0 AND rgt = 0
        ORDER BY office_name
    LOOP
        UPDATE iam.offices
        SET lft = pos,
            rgt = pos + 1,
            hlevel = 0,
            root_id = rec.id,
            parent_id = NULL
        WHERE id = rec.id;
        pos := pos + 2;
    END LOOP;
END $$;
