-- Suspect fingerprint templates (ISO/minutiae bytes — no images).

CREATE TABLE IF NOT EXISTS intelligence.suspect_fingerprints (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suspect_id      UUID NOT NULL REFERENCES intelligence.suspects(id) ON DELETE CASCADE,
    dossier_id      UUID NOT NULL REFERENCES intelligence.suspect_dossiers(id) ON DELETE CASCADE,
    template_id     UUID NOT NULL,
    print_id        UUID,
    finger_position VARCHAR(30) NOT NULL,
    template_format VARCHAR(30) NOT NULL DEFAULT 'ISO19794-2',
    template_data   BYTEA NOT NULL,
    template_hash   VARCHAR(64) NOT NULL,
    quality_score   REAL,
    device_model    VARCHAR(60),
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (dossier_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_suspect_fingerprints_suspect
    ON intelligence.suspect_fingerprints (suspect_id);

CREATE INDEX IF NOT EXISTS idx_suspect_fingerprints_print
    ON intelligence.suspect_fingerprints (print_id)
    WHERE print_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_suspect_fingerprints_hash
    ON intelligence.suspect_fingerprints (template_hash);
