-- Suspect associates (operational links between suspect profiles)

CREATE TABLE IF NOT EXISTS intelligence.suspect_associates (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suspect_id              UUID NOT NULL REFERENCES intelligence.suspects(id) ON DELETE CASCADE,
    dossier_id              UUID NOT NULL REFERENCES intelligence.suspect_dossiers(id) ON DELETE CASCADE,
    name                    VARCHAR(255) NOT NULL,
    association_type        VARCHAR(100),
    occupation              VARCHAR(255),
    notes                   TEXT,
    linked_master_suspect_id UUID REFERENCES intelligence.suspect_masters(id) ON DELETE SET NULL,
    linked_suspect_id       UUID REFERENCES intelligence.suspects(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suspect_associates_suspect
    ON intelligence.suspect_associates (suspect_id);

CREATE INDEX IF NOT EXISTS idx_suspect_associates_dossier
    ON intelligence.suspect_associates (dossier_id);

CREATE INDEX IF NOT EXISTS idx_suspect_associates_linked_master
    ON intelligence.suspect_associates (linked_master_suspect_id)
    WHERE linked_master_suspect_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_suspect_associates_name
    ON intelligence.suspect_associates (lower(name));
