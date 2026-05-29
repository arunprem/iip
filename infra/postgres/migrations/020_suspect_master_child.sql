-- Parent (master) suspect profiles and child dossier linking across units

CREATE TABLE IF NOT EXISTS intelligence.suspect_masters (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    display_name    VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suspect_masters_display_name
    ON intelligence.suspect_masters (lower(display_name));

ALTER TABLE intelligence.suspect_dossiers
    ADD COLUMN IF NOT EXISTS master_suspect_id UUID REFERENCES intelligence.suspect_masters(id);

ALTER TABLE intelligence.suspect_dossiers
    ADD COLUMN IF NOT EXISTS link_status VARCHAR(30) NOT NULL DEFAULT 'STANDALONE';

ALTER TABLE intelligence.suspect_dossiers
    DROP CONSTRAINT IF EXISTS suspect_dossiers_link_status_check;

ALTER TABLE intelligence.suspect_dossiers
    ADD CONSTRAINT suspect_dossiers_link_status_check
    CHECK (link_status IN ('STANDALONE', 'LINKED', 'PENDING_LINK_REVIEW'));

CREATE INDEX IF NOT EXISTS idx_suspect_dossiers_master
    ON intelligence.suspect_dossiers (master_suspect_id);

CREATE INDEX IF NOT EXISTS idx_suspect_dossiers_office
    ON intelligence.suspect_dossiers (office_id);

CREATE TABLE IF NOT EXISTS intelligence.suspect_link_decisions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dossier_id          UUID REFERENCES intelligence.suspect_dossiers(id) ON DELETE SET NULL,
    dossier_draft_id    UUID,
    matched_master_id   UUID REFERENCES intelligence.suspect_masters(id),
    matched_dossier_id  UUID REFERENCES intelligence.suspect_dossiers(id),
    face_similarity     DOUBLE PRECISION,
    match_score         INTEGER,
    decision            VARCHAR(20) NOT NULL
                        CHECK (decision IN ('CONFIRMED_LINK', 'REJECTED_LINK')),
    decided_by          UUID NOT NULL REFERENCES iam.users(id),
    decided_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrate existing flat records: one master per legacy suspect (same id)
INSERT INTO intelligence.suspect_masters (id, display_name, created_at, updated_at)
SELECT s.id, s.criminal_name, s.created_at, s.updated_at
FROM intelligence.suspects s
ON CONFLICT (id) DO NOTHING;

UPDATE intelligence.suspect_dossiers d
SET master_suspect_id = d.suspect_id,
    link_status = 'STANDALONE'
WHERE d.master_suspect_id IS NULL;

ALTER TABLE intelligence.suspect_dossiers
    ALTER COLUMN master_suspect_id SET NOT NULL;
