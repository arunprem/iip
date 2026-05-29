-- Allow one permanent and one present address per suspect

ALTER TABLE intelligence.suspect_addresses
    DROP CONSTRAINT IF EXISTS suspect_addresses_suspect_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_suspect_addresses_suspect_permanent
    ON intelligence.suspect_addresses (suspect_id, is_permanent);
