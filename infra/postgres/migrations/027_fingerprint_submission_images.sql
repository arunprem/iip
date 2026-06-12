-- Grayscale capture for NBIS mindtct alongside ISO templates (mobile field submit).

ALTER TABLE intelligence.suspect_fingerprint_submissions
    ADD COLUMN IF NOT EXISTS image_data BYTEA,
    ADD COLUMN IF NOT EXISTS image_width INTEGER,
    ADD COLUMN IF NOT EXISTS image_height INTEGER;
