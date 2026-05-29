-- Align suspect_link_decisions with Base ORM (id, created_at, updated_at)

ALTER TABLE intelligence.suspect_link_decisions
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
