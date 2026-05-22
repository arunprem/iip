-- Per-user notification history (inbox + read state)

CREATE TABLE IF NOT EXISTS iam.user_notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
    title           VARCHAR(255) NOT NULL,
    message         TEXT NOT NULL,
    notification_type VARCHAR(20) NOT NULL DEFAULT 'info',
    event_type      VARCHAR(100),
    payload         JSONB NOT NULL DEFAULT '{}',
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
    ON iam.user_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread
    ON iam.user_notifications (user_id)
    WHERE read_at IS NULL;
