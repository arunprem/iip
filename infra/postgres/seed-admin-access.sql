-- Idempotent patch: schema fixes, admin password, roles, and privileges.

-- ORM expects updated_at on iam.roles (Base model)
ALTER TABLE iam.roles
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Idempotent patch: grant admin user SYSTEM_ADMIN and system-management privileges.
-- Run against an existing database:
--   psql "$DATABASE_URL" -f infra/postgres/seed-admin-access.sql

-- Fix admin password (ChangeMe@IIP2026!)
UPDATE iam.users
SET password_hash = '$2b$12$ACwIjdUPXamqdWVx8dLuB.wpiq/K3wdN6fEApRSayNp6R4sSfrBui',
    updated_at = NOW()
WHERE username = 'admin';

-- Privileges (no-op if tables missing — run after init.sql schema)
CREATE TABLE IF NOT EXISTS iam.privileges (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    privilege_code  VARCHAR(100) UNIQUE NOT NULL,
    description     TEXT NOT NULL,
    module          VARCHAR(100) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS iam.role_privileges (
    role_id         UUID NOT NULL REFERENCES iam.roles(id) ON DELETE CASCADE,
    privilege_id    UUID NOT NULL REFERENCES iam.privileges(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, privilege_id)
);

INSERT INTO iam.privileges (privilege_code, description, module)
VALUES
    ('system:roles',       'Manage role definitions',              'System'),
    ('system:privileges',  'Manage privilege assignments',         'System'),
    ('system:menus',       'Manage navigation menus',              'System'),
    ('iam:users',          'Manage IAM users',                     'IAM'),
    ('iam:roles',          'Assign roles to users',                'IAM')
ON CONFLICT (privilege_code) DO NOTHING;

INSERT INTO iam.role_privileges (role_id, privilege_id)
SELECT r.id, p.id
FROM iam.roles r
CROSS JOIN iam.privileges p
WHERE r.role_name IN ('SYSTEM_ADMIN', 'IT_ADMIN')
  AND p.privilege_code IN ('system:roles', 'system:privileges', 'system:menus', 'iam:users', 'iam:roles')
ON CONFLICT DO NOTHING;

INSERT INTO iam.user_roles (user_id, role_id, justification)
SELECT u.id, r.id, 'Bootstrap system administrator'
FROM iam.users u
JOIN iam.roles r ON r.role_name = 'SYSTEM_ADMIN'
WHERE u.username = 'admin'
ON CONFLICT DO NOTHING;

-- Office-scoped SYSTEM_ADMIN at PHQ (menus use role for the selected office)
INSERT INTO iam.user_office_roles (user_id, office_id, role_id)
SELECT u.id, o.id, r.id
FROM iam.users u
CROSS JOIN iam.roles r
CROSS JOIN iam.offices o
WHERE u.username = 'admin'
  AND r.role_name = 'SYSTEM_ADMIN'
  AND o.office_code = 'PHQ'
ON CONFLICT (user_id, office_id) DO UPDATE SET role_id = EXCLUDED.role_id;
