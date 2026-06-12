-- Pending mobile fingerprint captures awaiting supervisor approval.

CREATE TABLE IF NOT EXISTS intelligence.suspect_fingerprint_submissions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suspect_id              UUID NOT NULL REFERENCES intelligence.suspects(id) ON DELETE CASCADE,
    dossier_id              UUID NOT NULL REFERENCES intelligence.suspect_dossiers(id) ON DELETE CASCADE,
    master_suspect_id       UUID NOT NULL REFERENCES intelligence.suspect_masters(id) ON DELETE CASCADE,
    template_id             UUID NOT NULL,
    print_id                UUID,
    finger_position         VARCHAR(30) NOT NULL,
    template_format         VARCHAR(30) NOT NULL DEFAULT 'ISO19794-2',
    template_data           BYTEA NOT NULL,
    template_hash           VARCHAR(64) NOT NULL,
    quality_score           REAL,
    device_model            VARCHAR(60),
    source                  VARCHAR(20) NOT NULL DEFAULT 'MOBILE',
    status                  VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    criminal_name           VARCHAR(255),
    captured_by             UUID REFERENCES iam.users(id) ON DELETE SET NULL,
    captured_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by             UUID REFERENCES iam.users(id) ON DELETE SET NULL,
    reviewed_at             TIMESTAMPTZ,
    review_notes            TEXT,
    approved_fingerprint_id UUID REFERENCES intelligence.suspect_fingerprints(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fp_submissions_status
    ON intelligence.suspect_fingerprint_submissions (status, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_fp_submissions_dossier
    ON intelligence.suspect_fingerprint_submissions (dossier_id);

CREATE INDEX IF NOT EXISTS idx_fp_submissions_captured_by
    ON intelligence.suspect_fingerprint_submissions (captured_by);
