-- Migration: Create intelligence.quick_suspect_captures table
-- Run manually or automatically on startup via FastAPI service context

CREATE TABLE IF NOT EXISTS intelligence.quick_suspect_captures (
    id           UUID PRIMARY KEY,
    name         VARCHAR(255) NOT NULL,
    storage_key  VARCHAR(512) NOT NULL,
    latitude     NUMERIC(10, 7),
    longitude    NUMERIC(10, 7),
    captured_by  UUID REFERENCES iam.users(id) ON DELETE SET NULL,
    captured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying quick suspect captures
CREATE INDEX IF NOT EXISTS idx_quick_suspects_captured_by ON intelligence.quick_suspect_captures (captured_by);
CREATE INDEX IF NOT EXISTS idx_quick_suspects_used ON intelligence.quick_suspect_captures (used);
