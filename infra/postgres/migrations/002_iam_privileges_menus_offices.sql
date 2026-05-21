-- IAM: offices, dynamic menus, privilege types, custom actions, office-scoped roles
-- Run: docker exec -i iip-postgres psql -U iip_user -d iip_db < infra/postgres/migrations/002_iam_privileges_menus_offices.sql

-- ─── Offices ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS iam.offices (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    office_code  VARCHAR(50) UNIQUE NOT NULL,
    office_name  VARCHAR(255) NOT NULL,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One role per user per office
CREATE TABLE IF NOT EXISTS iam.user_office_roles (
    user_id      UUID NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
    office_id    UUID NOT NULL REFERENCES iam.offices(id) ON DELETE CASCADE,
    role_id      UUID NOT NULL REFERENCES iam.roles(id) ON DELETE RESTRICT,
    granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, office_id)
);

CREATE INDEX IF NOT EXISTS idx_user_office_roles_office ON iam.user_office_roles (office_id);
CREATE INDEX IF NOT EXISTS idx_user_office_roles_role ON iam.user_office_roles (role_id);

-- ─── Extend privileges ───────────────────────────────────────────────────────

ALTER TABLE iam.privileges
    ADD COLUMN IF NOT EXISTS name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS privilege_type VARCHAR(20) NOT NULL DEFAULT 'DATA'
        CHECK (privilege_type IN ('MENU', 'DATA')),
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE iam.privileges SET name = description WHERE name IS NULL;

-- ─── Dynamic menus ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS iam.menus (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menu_key      VARCHAR(100) UNIQUE NOT NULL,
    label         VARCHAR(255) NOT NULL,
    path          VARCHAR(255),
    icon          VARCHAR(100) NOT NULL DEFAULT 'Circle',
    parent_id     UUID REFERENCES iam.menus(id) ON DELETE CASCADE,
    section       VARCHAR(100) NOT NULL DEFAULT 'Menu',
    sort_order    INTEGER NOT NULL DEFAULT 0,
    privilege_id  UUID REFERENCES iam.privileges(id) ON DELETE SET NULL,
    is_group      BOOLEAN NOT NULL DEFAULT FALSE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menus_parent ON iam.menus (parent_id);
CREATE INDEX IF NOT EXISTS idx_menus_privilege ON iam.menus (privilege_id);

-- ─── Custom actions per DATA privilege ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS iam.privilege_actions (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    privilege_id  UUID NOT NULL REFERENCES iam.privileges(id) ON DELETE CASCADE,
    action_code   VARCHAR(100) NOT NULL,
    action_label  VARCHAR(255) NOT NULL,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (privilege_id, action_code)
);

-- Role granted a specific action on a DATA privilege
CREATE TABLE IF NOT EXISTS iam.role_privilege_actions (
    role_id       UUID NOT NULL REFERENCES iam.roles(id) ON DELETE CASCADE,
    privilege_id  UUID NOT NULL REFERENCES iam.privileges(id) ON DELETE CASCADE,
    action_id     UUID NOT NULL REFERENCES iam.privilege_actions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, action_id)
);

-- Role granted a MENU privilege (visibility for menus sharing that privilege)
CREATE TABLE IF NOT EXISTS iam.role_menu_privileges (
    role_id       UUID NOT NULL REFERENCES iam.roles(id) ON DELETE CASCADE,
    privilege_id  UUID NOT NULL REFERENCES iam.privileges(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, privilege_id)
);

-- ─── Seed offices ────────────────────────────────────────────────────────────

INSERT INTO iam.offices (office_code, office_name)
VALUES
    ('HQ', 'State Intelligence Department — HQ'),
    ('ZONE-N', 'Northern Zone Command')
ON CONFLICT (office_code) DO NOTHING;

-- Migrate admin to office-scoped SYSTEM_ADMIN
INSERT INTO iam.user_office_roles (user_id, office_id, role_id)
SELECT u.id, o.id, r.id
FROM iam.users u
JOIN iam.offices o ON o.office_code = 'HQ'
JOIN iam.roles r ON r.role_name = 'SYSTEM_ADMIN'
WHERE u.username = 'admin'
ON CONFLICT DO NOTHING;
