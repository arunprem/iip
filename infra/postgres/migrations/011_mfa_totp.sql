-- MFA (Google Authenticator / TOTP) and org-wide force-2FA policy

ALTER TABLE iam.users
    ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN iam.users.mfa_enabled IS 'User opted in to TOTP; required when org force_mfa is on';
COMMENT ON COLUMN iam.users.mfa_secret IS 'Fernet-encrypted TOTP secret (base32)';

CREATE TABLE IF NOT EXISTS iam.system_settings (
    setting_key   VARCHAR(100) PRIMARY KEY,
    setting_value JSONB NOT NULL DEFAULT '{}',
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by    UUID REFERENCES iam.users(id) ON DELETE SET NULL
);

INSERT INTO iam.system_settings (setting_key, setting_value)
VALUES ('security', '{"force_mfa": false}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;
