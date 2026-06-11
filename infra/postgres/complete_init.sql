-- === BASE INITIALIZATION ===
-- IIP PostgreSQL Database Initialization Script
-- ─────────────────────────────────────────────────────────────────────────────
-- Creates all required extensions and schemas.
-- Individual service table DDLs are managed via Alembic migrations.

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- For fuzzy text search

-- Schemas per service domain
CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS cases;
CREATE SCHEMA IF NOT EXISTS intelligence;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS operations;

-- Grant service user access to all schemas
GRANT ALL PRIVILEGES ON SCHEMA iam TO iip_user;
GRANT ALL PRIVILEGES ON SCHEMA cases TO iip_user;
GRANT ALL PRIVILEGES ON SCHEMA intelligence TO iip_user;
GRANT ALL PRIVILEGES ON SCHEMA audit TO iip_user;
GRANT ALL PRIVILEGES ON SCHEMA operations TO iip_user;

-- ─── IAM: Core Tables ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS iam.users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username        VARCHAR(100) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    badge_number    VARCHAR(50) UNIQUE NOT NULL,
    department      VARCHAR(255) NOT NULL,
    password_hash   TEXT NOT NULL,
    clearance_level VARCHAR(20) NOT NULL DEFAULT 'UNCLASSIFIED'
                    CHECK (clearance_level IN ('UNCLASSIFIED','RESTRICTED','CONFIDENTIAL','SECRET','TOP SECRET')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    mfa_secret      TEXT,               -- Encrypted TOTP secret
    last_login_at   TIMESTAMPTZ,
    profile_photo_path VARCHAR(512),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS iam.roles (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_name     VARCHAR(100) UNIQUE NOT NULL,
    description   TEXT NOT NULL,
    requires_jit  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS iam.user_roles (
    user_id       UUID NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
    role_id       UUID NOT NULL REFERENCES iam.roles(id) ON DELETE CASCADE,
    granted_by    UUID REFERENCES iam.users(id),
    justification TEXT,
    granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMPTZ,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS iam.privileges (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    privilege_code  VARCHAR(100) UNIQUE NOT NULL,
    name            VARCHAR(255),
    description     TEXT NOT NULL,
    module          VARCHAR(100) NOT NULL,
    privilege_type  VARCHAR(20) NOT NULL DEFAULT 'DATA'
                    CHECK (privilege_type IN ('MENU', 'DATA')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS iam.role_privileges (
    role_id         UUID NOT NULL REFERENCES iam.roles(id) ON DELETE CASCADE,
    privilege_id    UUID NOT NULL REFERENCES iam.privileges(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, privilege_id)
);

CREATE TABLE IF NOT EXISTS iam.jit_sessions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES iam.users(id),
    target_clearance    VARCHAR(20) NOT NULL,
    justification       TEXT NOT NULL,
    status              VARCHAR(30) NOT NULL DEFAULT 'PENDING_MFA'
                        CHECK (status IN ('PENDING_MFA','PENDING_APPROVAL','APPROVED','DENIED','EXPIRED','REVOKED')),
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by         UUID REFERENCES iam.users(id),
    approved_at         TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    session_token_jti   TEXT
);

-- ─── Audit: Immutable Event Ledger ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit.events (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id            TEXT UNIQUE NOT NULL,
    service_name        VARCHAR(100) NOT NULL,
    action              VARCHAR(100) NOT NULL,
    actor_id            TEXT NOT NULL,
    actor_username      TEXT NOT NULL,
    resource            TEXT NOT NULL,
    resource_id         TEXT,
    outcome             VARCHAR(20) NOT NULL,
    classification      VARCHAR(20) NOT NULL,
    metadata            JSONB,
    previous_hash       TEXT NOT NULL,
    current_hash        TEXT NOT NULL,
    timestamp           TIMESTAMPTZ NOT NULL
);

-- Audit table must be immutable: no UPDATE or DELETE
CREATE RULE audit_no_update AS ON UPDATE TO audit.events DO INSTEAD NOTHING;
CREATE RULE audit_no_delete AS ON DELETE TO audit.events DO INSTEAD NOTHING;

-- Index for chain verification queries
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit.events (timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit.events (actor_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit.events (action, timestamp DESC);

-- ─── Seed: Default Roles ─────────────────────────────────────────────────────

INSERT INTO iam.roles (role_name, description, requires_jit)
VALUES
    ('SYSTEM_ADMIN',  'Full system administration access',       FALSE),
    ('IT_ADMIN',      'IT infrastructure management',            FALSE),
    ('SUPERVISOR',    'Operational supervisor with JIT approval', FALSE),
    ('ANALYST',       'Intelligence analyst — primary user role', FALSE),
    ('WATCH_OFFICER', 'Real-time watch operations officer',       FALSE),
    ('AUDITOR',       'Read-only access to audit trails',         FALSE)
ON CONFLICT (role_name) DO NOTHING;

-- ─── Seed: Default Admin User (Change password immediately!) ────────────────

-- Password: 'ChangeMe@IIP2026!' (bcrypt hash)
INSERT INTO iam.users (username, email, full_name, badge_number, department, password_hash, clearance_level)
VALUES (
    'admin',
    'admin@keralapolice.gov.in',
    'System Administrator',
    'SYS-0001',
    'Information Technology Wing',
    '$2b$12$ACwIjdUPXamqdWVx8dLuB.wpiq/K3wdN6fEApRSayNp6R4sSfrBui',
    'CONFIDENTIAL'
) ON CONFLICT (username) DO NOTHING;

-- ─── Seed: System privileges ─────────────────────────────────────────────────

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

-- ─── Seed: Assign SYSTEM_ADMIN to admin user ─────────────────────────────────

INSERT INTO iam.user_roles (user_id, role_id, justification)
SELECT u.id, r.id, 'Bootstrap system administrator'
FROM iam.users u
JOIN iam.roles r ON r.role_name = 'SYSTEM_ADMIN'
WHERE u.username = 'admin'
ON CONFLICT DO NOTHING;



-- === MIGRATION: 002_iam_privileges_menus_offices.sql ===
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



-- === MIGRATION: 003_seed_menus_privileges.sql ===
-- Seed MENU/DATA privileges, menus, actions, and SYSTEM_ADMIN grants
-- Run after 002_iam_privileges_menus_offices.sql

-- MENU privileges (multiple menus may share one privilege)
INSERT INTO iam.privileges (privilege_code, name, description, module, privilege_type)
VALUES
    ('menu:dashboard',       'Dashboard',              'Access dashboard',                 'Menu', 'MENU'),
    ('menu:watch-console',   'Watch Console',          'Access watch console',             'Menu', 'MENU'),
    ('menu:cases',           'Intelligence Cases',     'Access intelligence cases',        'Menu', 'MENU'),
    ('menu:analytics',       'Analytics',              'Access analytics section',         'Menu', 'MENU'),
    ('menu:analyst-workbench','Analyst Workbench',     'Access analyst workbench',         'Menu', 'MENU'),
    ('menu:hotspot-console', 'Hotspot Console',        'Access hotspot console',           'Menu', 'MENU'),
    ('menu:kg-canvas',       'Knowledge Graph',        'Access knowledge graph',           'Menu', 'MENU'),
    ('menu:humint-vault',    'HUMINT Vault',           'Access HUMINT vault',              'Menu', 'MENU'),
    ('menu:system-management','System Management',     'Access system administration',     'Menu', 'MENU'),
    ('menu:role-management', 'Role Management',        'Access role management',           'Menu', 'MENU'),
    ('menu:privilege-management','Privilege Management','Access privilege management',    'Menu', 'MENU'),
    ('menu:menu-management', 'Menu Management',        'Access menu management',           'Menu', 'MENU')
ON CONFLICT (privilege_code) DO UPDATE SET
    name = EXCLUDED.name,
    privilege_type = EXCLUDED.privilege_type,
    module = EXCLUDED.module;

-- DATA privileges
INSERT INTO iam.privileges (privilege_code, name, description, module, privilege_type)
VALUES
    ('data:cases',           'Cases',           'Intelligence case records',     'Cases', 'DATA'),
    ('data:humint',          'HUMINT',          'HUMINT sources and vault',    'HUMINT', 'DATA'),
    ('data:analytics',       'Analytics',       'Analytics and workbench data',  'Analytics', 'DATA'),
    ('data:iam-users',       'IAM Users',       'User administration',         'IAM', 'DATA'),
    ('data:iam-roles',       'IAM Roles',       'Role administration',         'IAM', 'DATA'),
    ('data:system-config',   'System Config',   'System configuration',        'System', 'DATA')
ON CONFLICT (privilege_code) DO UPDATE SET
    name = EXCLUDED.name,
    privilege_type = EXCLUDED.privilege_type;

-- Default custom actions per DATA privilege
INSERT INTO iam.privilege_actions (privilege_id, action_code, action_label, sort_order)
SELECT p.id, a.code, a.label, a.ord
FROM iam.privileges p
JOIN (VALUES
    ('data:cases', 'READ', 'Read', 1),
    ('data:cases', 'CREATE', 'Create', 2),
    ('data:cases', 'UPDATE', 'Update', 3),
    ('data:cases', 'DELETE', 'Delete', 4),
    ('data:cases', 'EXPORT', 'Export', 5),
    ('data:humint', 'READ', 'Read', 1),
    ('data:humint', 'CREATE', 'Create', 2),
    ('data:humint', 'UPDATE', 'Update', 3),
    ('data:humint', 'DELETE', 'Delete', 4),
    ('data:analytics', 'READ', 'Read', 1),
    ('data:analytics', 'UPDATE', 'Update', 2),
    ('data:iam-users', 'READ', 'Read', 1),
    ('data:iam-users', 'CREATE', 'Create', 2),
    ('data:iam-users', 'UPDATE', 'Update', 3),
    ('data:iam-users', 'DELETE', 'Delete', 4),
    ('data:iam-roles', 'READ', 'Read', 1),
    ('data:iam-roles', 'CREATE', 'Create', 2),
    ('data:iam-roles', 'UPDATE', 'Update', 3),
    ('data:system-config', 'READ', 'Read', 1),
    ('data:system-config', 'UPDATE', 'Update', 2)
) AS a(priv_code, code, label, ord) ON p.privilege_code = a.priv_code
ON CONFLICT (privilege_id, action_code) DO NOTHING;

-- Menus (groups + items)
INSERT INTO iam.menus (menu_key, label, path, icon, section, sort_order, privilege_id, is_group, parent_id)
SELECT 'analytics', 'Analytics', NULL, 'BarChart3', 'Menu', 40, p.id, TRUE, NULL
FROM iam.privileges p WHERE p.privilege_code = 'menu:analytics'
ON CONFLICT (menu_key) DO NOTHING;

INSERT INTO iam.menus (menu_key, label, path, icon, section, sort_order, privilege_id, is_group, parent_id)
VALUES
    ('dashboard', 'Dashboard', '/dashboard', 'LayoutDashboard', 'Menu', 10, (SELECT id FROM iam.privileges WHERE privilege_code='menu:dashboard'), FALSE, NULL),
    ('watch-console', 'Watch Console', '/watch-console', 'Radio', 'Menu', 20, (SELECT id FROM iam.privileges WHERE privilege_code='menu:watch-console'), FALSE, NULL),
    ('cases', 'Intelligence Cases', '/cases', 'FolderOpen', 'Menu', 30, (SELECT id FROM iam.privileges WHERE privilege_code='menu:cases'), FALSE, NULL),
    ('analyst-workbench', 'Analyst Workbench', '/analyst-workbench', 'Bot', 'Menu', 41, (SELECT id FROM iam.privileges WHERE privilege_code='menu:analyst-workbench'), FALSE, (SELECT id FROM iam.menus WHERE menu_key='analytics')),
    ('hotspot-console', 'Hotspot Console', '/hotspot-console', 'MapPin', 'Menu', 42, (SELECT id FROM iam.privileges WHERE privilege_code='menu:hotspot-console'), FALSE, (SELECT id FROM iam.menus WHERE menu_key='analytics')),
    ('kg-canvas', 'Knowledge Graph', '/kg-canvas', 'Network', 'Menu', 43, (SELECT id FROM iam.privileges WHERE privilege_code='menu:kg-canvas'), FALSE, (SELECT id FROM iam.menus WHERE menu_key='analytics')),
    ('humint-vault', 'HUMINT Vault', '/humint-vault', 'UserCheck', 'Menu', 50, (SELECT id FROM iam.privileges WHERE privilege_code='menu:humint-vault'), FALSE, NULL)
ON CONFLICT (menu_key) DO NOTHING;

INSERT INTO iam.menus (menu_key, label, path, icon, section, sort_order, privilege_id, is_group, parent_id)
SELECT 'system-management', 'System Management', NULL, 'Settings', 'Administration', 10, p.id, TRUE, NULL
FROM iam.privileges p WHERE p.privilege_code = 'menu:system-management'
ON CONFLICT (menu_key) DO NOTHING;

INSERT INTO iam.menus (menu_key, label, path, icon, section, sort_order, privilege_id, is_group, parent_id)
VALUES
    ('role-management', 'Role Management', '/system/roles', 'Shield', 'Administration', 11, (SELECT id FROM iam.privileges WHERE privilege_code='menu:role-management'), FALSE, (SELECT id FROM iam.menus WHERE menu_key='system-management')),
    ('privilege-management', 'Privilege Management', '/system/privileges', 'KeyRound', 'Administration', 12, (SELECT id FROM iam.privileges WHERE privilege_code='menu:privilege-management'), FALSE, (SELECT id FROM iam.menus WHERE menu_key='system-management')),
    ('menu-management', 'Menu Management', '/system/menus', 'Menu', 'Administration', 13, (SELECT id FROM iam.privileges WHERE privilege_code='menu:menu-management'), FALSE, (SELECT id FROM iam.menus WHERE menu_key='system-management'))
ON CONFLICT (menu_key) DO NOTHING;

-- SYSTEM_ADMIN: all menu privileges + all data actions
INSERT INTO iam.role_menu_privileges (role_id, privilege_id)
SELECT r.id, p.id
FROM iam.roles r
CROSS JOIN iam.privileges p
WHERE r.role_name = 'SYSTEM_ADMIN' AND p.privilege_type = 'MENU'
ON CONFLICT DO NOTHING;

INSERT INTO iam.role_privilege_actions (role_id, privilege_id, action_id)
SELECT r.id, pa.privilege_id, pa.id
FROM iam.roles r
CROSS JOIN iam.privilege_actions pa
WHERE r.role_name = 'SYSTEM_ADMIN'
ON CONFLICT DO NOTHING;

-- IT_ADMIN: system menus + system data
INSERT INTO iam.role_menu_privileges (role_id, privilege_id)
SELECT r.id, p.id
FROM iam.roles r
JOIN iam.privileges p ON p.privilege_code LIKE 'menu:system%' OR p.privilege_code LIKE 'menu:role%' OR p.privilege_code LIKE 'menu:privilege%' OR p.privilege_code LIKE 'menu:menu%'
WHERE r.role_name = 'IT_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO iam.role_privilege_actions (role_id, privilege_id, action_id)
SELECT r.id, pa.privilege_id, pa.id
FROM iam.roles r
JOIN iam.privileges p ON p.privilege_code IN ('data:iam-users', 'data:iam-roles', 'data:system-config')
JOIN iam.privilege_actions pa ON pa.privilege_id = p.id
WHERE r.role_name = 'IT_ADMIN'
ON CONFLICT DO NOTHING;



-- === MIGRATION: 004_offices_nested_set.sql ===
-- Office hierarchy using nested set model (aligned with legacy unit table)
-- Run after 002_iam_privileges_menus_offices.sql

ALTER TABLE iam.offices
    ADD COLUMN IF NOT EXISTS ncrb_id VARCHAR(20),
    ADD COLUMN IF NOT EXISTS office_short_code VARCHAR(100),
    ADD COLUMN IF NOT EXISTS office_type_id INTEGER,
    ADD COLUMN IF NOT EXISTS head_rank INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_parent_unit BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS district_id INTEGER,
    ADD COLUMN IF NOT EXISTS list_order INTEGER,
    ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES iam.offices(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS lft INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS rgt INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS hlevel INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS root_id UUID REFERENCES iam.offices(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_offices_parent ON iam.offices (parent_id);
CREATE INDEX IF NOT EXISTS idx_offices_nested ON iam.offices (root_id, lft);
CREATE INDEX IF NOT EXISTS idx_offices_lft_rgt ON iam.offices (lft, rgt);

-- Initialize existing rows as single-node trees if not yet set
DO $$
DECLARE
    rec RECORD;
    pos INTEGER := 1;
BEGIN
    FOR rec IN
        SELECT id FROM iam.offices
        WHERE lft = 0 AND rgt = 0
        ORDER BY office_name
    LOOP
        UPDATE iam.offices
        SET lft = pos,
            rgt = pos + 1,
            hlevel = 0,
            root_id = rec.id,
            parent_id = NULL
        WHERE id = rec.id;
        pos := pos + 2;
    END LOOP;
END $$;



-- === MIGRATION: 004_privileges_updated_at.sql ===
-- Align legacy privileges / privilege_actions tables with iip_core Base audit columns

ALTER TABLE iam.privileges
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE iam.privilege_actions
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();



-- === MIGRATION: 005_seed_office_management_menu.sql ===
-- Office management menu + privilege
INSERT INTO iam.privileges (privilege_code, name, description, module, privilege_type)
VALUES
    ('menu:office-management', 'Office Management', 'Manage organizational unit hierarchy', 'IAM', 'MENU')
ON CONFLICT (privilege_code) DO UPDATE SET
    name = EXCLUDED.name,
    privilege_type = EXCLUDED.privilege_type;

INSERT INTO iam.menus (menu_key, label, path, icon, section, sort_order, privilege_id, is_group, parent_id)
VALUES
    (
        'office-management',
        'Office Management',
        '/system/offices',
        'Building2',
        'Administration',
        14,
        (SELECT id FROM iam.privileges WHERE privilege_code = 'menu:office-management'),
        FALSE,
        (SELECT id FROM iam.menus WHERE menu_key = 'system-management')
    )
ON CONFLICT (menu_key) DO NOTHING;

INSERT INTO iam.role_menu_privileges (role_id, privilege_id)
SELECT r.id, p.id
FROM iam.roles r
CROSS JOIN iam.privileges p
WHERE r.role_name = 'SYSTEM_ADMIN' AND p.privilege_code = 'menu:office-management'
ON CONFLICT DO NOTHING;



-- === MIGRATION: 006_offices_legacy_unit_id.sql ===
-- Track legacy unit.id for imports and reconciliation
ALTER TABLE iam.offices
    ADD COLUMN IF NOT EXISTS legacy_unit_id INTEGER UNIQUE;

CREATE INDEX IF NOT EXISTS idx_offices_legacy_unit_id ON iam.offices (legacy_unit_id);



-- === MIGRATION: 007_unit_type_rank.sql ===
-- Legacy unit_type and rank reference tables (from qdatakpapp_2025)
-- Run after 006_offices_legacy_unit_id.sql

CREATE TABLE IF NOT EXISTS iam.unit_types (
    id          INTEGER PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS iam.ranks (
    id             INTEGER PRIMARY KEY,
    rank_desc      VARCHAR(255),
    rank_short_tag VARCHAR(100),
    unit_head      BOOLEAN NOT NULL DEFAULT FALSE,
    rank_priority  INTEGER NOT NULL DEFAULT 0,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_ranks_priority ON iam.ranks (rank_priority, id);

INSERT INTO iam.unit_types (id, description, is_active) VALUES
    (1, 'PHQ', TRUE),
    (2, 'SBCID', TRUE),
    (3, 'SCRB', TRUE),
    (5, 'TELE', TRUE),
    (7, 'PTC', TRUE),
    (8, 'KEPA', TRUE),
    (9, 'ZONE', TRUE),
    (10, 'RANGE', TRUE),
    (11, 'DISTRICT', TRUE),
    (12, 'AR', TRUE),
    (13, 'BATTALION', TRUE),
    (14, 'DCRB', TRUE),
    (15, 'NARCOTIC CELL', TRUE),
    (16, 'CRIME DETACHMENT', TRUE),
    (17, 'DIST SB', TRUE),
    (18, 'DIST ADMIN', TRUE),
    (19, 'SDPO', TRUE),
    (20, 'CIRCLE', TRUE),
    (21, 'PS', TRUE),
    (22, 'VACB', TRUE),
    (23, 'OTHER DEPT', TRUE),
    (24, 'ROOT', FALSE),
    (26, 'COASTAL SECURITY', TRUE),
    (27, 'CBCID', TRUE),
    (28, 'TRAFFIC', TRUE),
    (29, 'FSL', TRUE),
    (30, 'HIGH WAY POLICE', TRUE),
    (31, 'TRAINING', TRUE),
    (32, 'WOMEN CELL', TRUE),
    (33, 'C-Room', TRUE),
    (34, 'TOURISM', TRUE),
    (35, 'CYBER CELL', TRUE),
    (36, 'Mounted Police', TRUE),
    (37, 'Temple', TRUE),
    (38, 'FBP', TRUE),
    (39, 'PHOTOGRAPHIC BUREAU', TRUE),
    (40, 'CRIME BRANCH', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.ranks (id, rank_desc, rank_short_tag, unit_head, rank_priority, is_active) VALUES
    (1, 'DIRECTOR GENERAL OF POLICE', 'DGP', TRUE, 1, TRUE),
    (2, 'ADDITIONAL DIRECTOR GENERAL OF POLICE', 'ADGP', TRUE, 2, TRUE),
    (3, 'INSPECTOR GENERAL OF POLICE', 'IGP', TRUE, 3, TRUE),
    (4, 'DEPUTY INSPECTOR GENERAL OF POLICE', 'DIG', TRUE, 4, TRUE),
    (5, 'SUPERINTENDENT OF POLICE ', 'SP IPS', TRUE, 5, TRUE),
    (6, 'SUPERINTENDENT OF POLICE (NON IPS)', 'SP EX', TRUE, 5, TRUE),
    (7, 'COMMANDANT(AR)', 'CMT AR', TRUE, 5, TRUE),
    (8, 'COMMANDANT(BN)', 'CMT BN', TRUE, 5, TRUE),
    (9, 'DEPUTY COMMANDANT(AR)', 'DC AR', TRUE, 6, TRUE),
    (10, 'ASSISTANT SUPERINTENDENT OF POLICE ', 'ASP', TRUE, 7, TRUE),
    (11, 'DEPUTY SUPERINTENDENT OF POLICE ', 'DySP', TRUE, 7, TRUE),
    (12, 'INSPECTOR', 'CI', TRUE, 8, TRUE),
    (13, 'WOMAN INSPECTOR', 'WCI', TRUE, 8, TRUE),
    (14, 'SUB INSPECTOR', 'SI', TRUE, 9, TRUE),
    (15, 'WOMAN SUB INSPECTOR', 'WSI', TRUE, 9, TRUE),
    (16, 'ASSISTANT SUB INSPECTOR', 'ASI', FALSE, 10, TRUE),
    (17, 'HEAD CONSTABLE', 'HC', FALSE, 11, TRUE),
    (18, 'POLICE CONSTABLE', 'PC', FALSE, 12, TRUE),
    (19, 'WOMAN HEAD CONSTABLE', 'WHC', FALSE, 11, TRUE),
    (20, 'WOMAN CONSTABLE', 'WPC', FALSE, 12, TRUE),
    (21, 'ASSISTANT COMMANDANT(AR)', 'AC AR', TRUE, 7, TRUE),
    (22, 'INSPECTOR(RESERVE)', 'RI', FALSE, 8, TRUE),
    (23, 'SUB INSPECTOR(RESERVE)', 'RSI', FALSE, 9, TRUE),
    (24, 'DRIVER SUB INSPECTOR', 'Dvr SI', FALSE, 9, TRUE),
    (25, 'RSI (DH) Upgraded post', 'RSI DHUpd', FALSE, 9, TRUE),
    (26, 'MT SI', 'MT SI', FALSE, 9, TRUE),
    (27, 'ARMR SI', 'ARMR SI', FALSE, 9, TRUE),
    (28, 'ASISTANT SUB INSPECTOR(RESERVE)', 'RASI', FALSE, 10, TRUE),
    (29, 'ARMR ASI', 'ARMR ASI', FALSE, 10, TRUE),
    (30, 'HC AR', 'HC AR', FALSE, 11, TRUE),
    (31, 'ARMR HC/ARMR HVL', 'ARMR HC', FALSE, 11, TRUE),
    (33, 'PC AR', 'PC AR', FALSE, 12, TRUE),
    (34, 'DVR HC/PC AR', 'DVR HC/PC AR', FALSE, 11, TRUE),
    (35, 'ARMR PC', 'ARMR PC', FALSE, 12, TRUE),
    (38, 'DRUMMER', 'DRUMMER', FALSE, 12, TRUE),
    (39, 'TAILOR', 'TAILOR', FALSE, 12, TRUE),
    (40, 'ELECTRICIAN', 'ELECTRICIAN', FALSE, 12, TRUE),
    (41, 'PAINTER', 'PAINTER', FALSE, 12, TRUE),
    (42, 'CARPENTER', 'CARPENTER', FALSE, 12, TRUE),
    (43, 'MECHANIC', 'MECHANIC', FALSE, 12, TRUE),
    (45, 'SENIOR AA', 'SENIOR AA', FALSE, 7, TRUE),
    (46, 'AA', 'AA', FALSE, 8, TRUE),
    (47, 'AO', 'AO', FALSE, 8, TRUE),
    (49, 'JS', 'JS', FALSE, 9, TRUE),
    (50, 'SYSTEM ANALYST/PROGRAM MANAGER', 'SA', FALSE, 9, TRUE),
    (52, 'HEAD CLERK', 'HEAD CLERK', FALSE, 10, TRUE),
    (53, 'UDC', 'UDC', FALSE, 11, TRUE),
    (54, 'LDC', 'LDC', FALSE, 11, TRUE),
    (55, 'CA', 'CA', FALSE, 8, TRUE),
    (56, 'FCS', 'FCS', FALSE, 9, TRUE),
    (57, 'SGT', 'SGT', FALSE, 9, TRUE),
    (58, 'UDT', 'UDT', FALSE, 11, TRUE),
    (60, 'PEON', 'PEON', FALSE, 13, TRUE),
    (61, 'PHOTOGRAPHER', 'PHOTOGRAPHER', TRUE, 9, TRUE),
    (62, 'SCIENTIFIC ASST', 'SCIENTIFIC ASST', FALSE, 9, TRUE),
    (63, 'ASST SURGEON', 'ASST SURGEON', FALSE, 9, TRUE),
    (64, 'STAFF NURSE', 'STAFF NURSE', FALSE, 11, TRUE),
    (65, 'HEAD NURSE', 'HEAD NURSE', FALSE, 10, TRUE),
    (66, 'NURSING ASST', 'NURSING ASST', FALSE, 13, TRUE),
    (71, 'PTS (HOSPITAL)', 'PTS (HOSPITAL)', FALSE, 13, TRUE),
    (72, 'CF BARBER', 'CF BARBER', FALSE, 14, TRUE),
    (73, 'CF DHOBY', 'CF DHOBY', FALSE, 14, TRUE),
    (74, 'CF COOK', 'CF COOK', FALSE, 14, TRUE),
    (75, 'CF SWEEPER', 'CF SWEEPER', FALSE, 14, TRUE),
    (76, 'DEPUTY COMMANDANT(BN)', 'DC BN', FALSE, 6, TRUE),
    (77, 'ASSISTANT COMMANDANT (BN)', 'AC BN', TRUE, 7, TRUE),
    (78, 'API ', 'API ', FALSE, 8, TRUE),
    (79, 'MTI', 'MTI', FALSE, 8, TRUE),
    (80, 'ARMOUR  INSPECTOR', 'ARMOUR  INSPECTOR', FALSE, 8, TRUE),
    (81, 'API BAND', 'API BAND', FALSE, 8, TRUE),
    (82, 'APSI/APSI(TRG POST)', 'APSI/APSI(TRG POST)', FALSE, 9, TRUE),
    (83, 'APSI BAND', 'APSI BAND', FALSE, 9, TRUE),
    (88, 'AP ASI', 'AP ASI', FALSE, 10, TRUE),
    (89, 'ASI MECHANIC(RW)', 'ASI MECHANIC(RW)', FALSE, 10, TRUE),
    (90, 'HAVILDAR', 'HDR ', FALSE, 11, TRUE),
    (92, 'HDR BAND', 'HDR BAND', FALSE, 11, TRUE),
    (93, 'RT WPC ', 'RT WPC ', FALSE, 12, TRUE),
    (94, 'PC (BN)', 'PC (BN)', FALSE, 12, TRUE),
    (97, 'RTPC', 'RTPC', FALSE, 12, TRUE),
    (98, 'LATHE/OPR.PC(RW)', 'LATHE/OPR.PC(RW)', FALSE, 12, TRUE),
    (100, 'WELDER(PC)', 'WELDER(PC)', FALSE, 12, TRUE),
    (106, 'BUGLER    PC', 'BUGLER    PC', FALSE, 12, TRUE),
    (108, 'BLACKSMITH     PC', 'BLACKSMITH     PC', FALSE, 12, TRUE),
    (112, 'CLEANER', 'CLEANER', FALSE, 12, TRUE),
    (113, 'HC MECHANIC/HVL MECHANIC', 'HC MECHANIC/HVL MECHANIC', FALSE, 11, TRUE),
    (114, 'FITTER      PC', 'FITTER      PC', FALSE, 12, TRUE),
    (115, 'PC BAND', 'PC BAND', FALSE, 12, TRUE),
    (116, 'PTS', 'PTS', FALSE, 13, TRUE),
    (118, 'MANAGER/SS/AO', 'MANAGER/SS/AO', FALSE, 8, TRUE),
    (119, 'SGA', 'SGA', FALSE, 9, TRUE),
    (120, 'ISA/HA/SA', 'ISA/HA/SA', FALSE, 10, TRUE),
    (121, 'CASHIER', 'CASHIER', FALSE, 10, TRUE),
    (129, 'LDT', 'LDT', FALSE, 11, TRUE),
    (130, 'ATTENDER', 'ATTENDER', FALSE, 13, TRUE),
    (133, 'MACHINIST PC (RW)', 'MACHINIST PC (RW)', FALSE, 12, TRUE),
    (134, 'RANGE WARDEN(RW)', 'RANGE WARDEN(RW)', FALSE, 12, TRUE),
    (135, 'UPHOLSTER(RW)', 'UPHOLSTER(RW)', FALSE, 13, TRUE),
    (137, 'ANM/JPH NURSE', 'ANM/JPH NURSE', FALSE, 11, TRUE),
    (140, 'PHARMASIST', 'PHARMASIST', FALSE, 11, TRUE),
    (141, 'HOSPITAL ATTENDER GR.I', 'HSP ATDR GR1', FALSE, 13, TRUE),
    (142, 'HOSPITAL ATTENDER GR.II', 'HSP ATDR GR2', FALSE, 13, TRUE),
    (149, 'WATER CARRIER(CF)', 'WATER CARRIER(CF)', FALSE, 14, TRUE),
    (150, 'SYSTEM ANALYST', 'SA', FALSE, 5, TRUE),
    (151, 'DIRECTOR FINGER PRINT', 'DFPB', TRUE, 5, TRUE),
    (152, 'STASTICAL OFFICER', 'SO', FALSE, 7, TRUE),
    (153, 'UD COMPILER', 'UD COMPILER', FALSE, 11, TRUE),
    (154, 'CHIEF PHOTO GRAPHER', 'CHIEF PHOTO GRAPHER', FALSE, 7, TRUE),
    (156, 'DIRECTOR FSL', 'DIRECTOR FSL', TRUE, 5, TRUE),
    (157, 'TESTER .INSP  (FPB)', 'TESTER IP FPB', FALSE, 8, TRUE),
    (158, 'FP EXPERT', 'FP EXPERT', FALSE, 9, TRUE),
    (159, 'ASST.DIRECTOR, F.S.L', 'ADR FSL', FALSE, 7, TRUE),
    (160, 'JT.DIRECTOR, F.S.L', 'JTR FSL', FALSE, 7, TRUE),
    (161, 'FP SEARCHER', 'FP SEARCHER', FALSE, 10, TRUE),
    (162, 'P.T.EMPLOYEE', 'P.T.EMPLOYEE', FALSE, 13, TRUE),
    (163, 'TECH.ATTENDER', 'TECH.ATTENDER', FALSE, 13, TRUE),
    (164, 'SCIENTIFIC ASSISTANT, F.S.L', 'SCIENTIFIC ASSISTANT, F.S.L', FALSE, 9, TRUE),
    (165, 'ASST. DIRECTOR (FINANCIAL & OFFICE PROCEDURE)', 'AST DIRECTOR (FOP)', FALSE, 7, TRUE),
    (166, 'HEAD OF DEPT (FSL)', 'HOD FSL', FALSE, 8, TRUE),
    (167, 'HEAD OF DEPT (LAW)', 'HOD LAW', FALSE, 8, TRUE),
    (168, 'HEAD OF DEPT (BEHAVIOURAL SCIENCE)', 'HOD BEHAVIOURAL SCIENCE', FALSE, 8, TRUE),
    (169, 'HEAD OF DEPT (FORENSIC MEDICINE)', 'HOD FORENSIC MEDICINE', FALSE, 8, TRUE),
    (170, 'HEAD OF DEPT (COMPUTER APPL.)', 'HOD CMPT APLN', FALSE, 8, TRUE),
    (171, 'SENIOR INSTRUCTOR (FORENSIC SCIENCE)', 'SNR INSTRUCTOR FSL', FALSE, 9, TRUE),
    (172, 'SENIOR LECTURER (COMPUTER SCIENCE)', 'SNR LECTURER CS', FALSE, 9, TRUE),
    (173, 'CRIMINOLOGIST', 'CRIMINOLOGIST', FALSE, 9, TRUE),
    (174, 'SR.LAW INSTRUCTOR ( C. I )', 'SR.LAW INSTRUCTOR ( C. I )', FALSE, 8, TRUE),
    (175, 'CINE OPERATOR', 'CINE OPERATOR', FALSE, 13, TRUE),
    (176, 'LIBRARARIAN', 'LIBRARARIAN', FALSE, 13, TRUE),
    (177, 'BINDER', 'BINDER', FALSE, 13, TRUE),
    (178, 'DRAFTS MAN', 'DRAFTS MAN', FALSE, 13, TRUE),
    (179, 'SHORT HAND REPORTER', 'SHORT HR', FALSE, 8, TRUE),
    (180, 'FCS SB', 'FCS SB', FALSE, 11, TRUE),
    (181, 'LASCAR', 'LASCAR', FALSE, 13, TRUE),
    (182, 'MEDICO LEGAL ADVISOR', 'MEDICO LEGAL ADVSR', FALSE, 8, TRUE),
    (183, 'REPORTER(II)SHB', 'REPORTER(II)SHB', FALSE, 11, TRUE),
    (184, 'COBBLER(MP)', 'COBBLER(MP)', FALSE, 13, TRUE),
    (185, 'LAB  TECHNICHIAN', 'LAB  TECH', FALSE, 13, TRUE),
    (186, 'GARDNER', 'GARDNER', FALSE, 13, TRUE),
    (187, 'PC(ORCH)', 'PC(ORCH)', FALSE, 12, TRUE),
    (189, 'SP (TELE)', 'SP (TELE)', TRUE, 5, TRUE),
    (190, 'DEPUTY SUPERINTENDENT OF POLICE (TELE)', 'DySP TELE', FALSE, 7, TRUE),
    (191, 'INSPECTOR OF POLICE(TELE)', 'IP TELE', TRUE, 8, TRUE),
    (192, 'SUB INSPECTOR OF POLICE (TELE)', 'SI TELE', FALSE, 9, TRUE),
    (194, 'ASSISTANT SUB INSPECTOR OF POLICE(TELE)', 'ASI TELE', FALSE, 10, TRUE),
    (195, 'HEAD CONSTABLE (TELE)', 'HC TELE', FALSE, 11, TRUE),
    (197, 'POLICE CONSTABLE (TELE)', 'PC TELE', FALSE, 12, TRUE),
    (198, 'Special Police Officer', 'SPO', FALSE, 0, TRUE)
ON CONFLICT (id) DO NOTHING;



-- === MIGRATION: 008_seed_rank_unit_type_menus.sql ===
-- Rank and unit type master menus
INSERT INTO iam.privileges (privilege_code, name, description, module, privilege_type)
VALUES
    ('menu:unit-type-management', 'Unit Type Management', 'Manage office unit type reference data', 'IAM', 'MENU'),
    ('menu:rank-management', 'Rank Management', 'Manage police rank reference data', 'IAM', 'MENU')
ON CONFLICT (privilege_code) DO UPDATE SET
    name = EXCLUDED.name,
    privilege_type = EXCLUDED.privilege_type;

INSERT INTO iam.menus (menu_key, label, path, icon, section, sort_order, privilege_id, is_group, parent_id)
VALUES
    (
        'unit-type-management',
        'Unit Types',
        '/system/unit-types',
        'Tags',
        'Administration',
        15,
        (SELECT id FROM iam.privileges WHERE privilege_code = 'menu:unit-type-management'),
        FALSE,
        (SELECT id FROM iam.menus WHERE menu_key = 'system-management')
    ),
    (
        'rank-management',
        'Ranks',
        '/system/ranks',
        'Award',
        'Administration',
        16,
        (SELECT id FROM iam.privileges WHERE privilege_code = 'menu:rank-management'),
        FALSE,
        (SELECT id FROM iam.menus WHERE menu_key = 'system-management')
    )
ON CONFLICT (menu_key) DO UPDATE SET
    label = EXCLUDED.label,
    path = EXCLUDED.path,
    icon = EXCLUDED.icon,
    section = EXCLUDED.section,
    sort_order = EXCLUDED.sort_order,
    privilege_id = EXCLUDED.privilege_id,
    is_group = EXCLUDED.is_group,
    parent_id = EXCLUDED.parent_id;

INSERT INTO iam.role_menu_privileges (role_id, privilege_id)
SELECT r.id, p.id
FROM iam.roles r
CROSS JOIN iam.privileges p
WHERE r.role_name = 'SYSTEM_ADMIN'
  AND p.privilege_code IN ('menu:unit-type-management', 'menu:rank-management')
ON CONFLICT DO NOTHING;

-- IT_ADMIN: same system-administration menus as other IAM master screens
INSERT INTO iam.role_menu_privileges (role_id, privilege_id)
SELECT r.id, p.id
FROM iam.roles r
CROSS JOIN iam.privileges p
WHERE r.role_name = 'IT_ADMIN'
  AND p.privilege_code IN (
    'menu:unit-type-management',
    'menu:rank-management',
    'menu:office-management'
  )
ON CONFLICT DO NOTHING;



-- === MIGRATION: 009_seed_user_management_menu.sql ===
-- User management menu
INSERT INTO iam.privileges (privilege_code, name, description, module, privilege_type)
VALUES
    ('menu:user-management', 'User Management', 'Manage IAM users and office role assignments', 'IAM', 'MENU')
ON CONFLICT (privilege_code) DO UPDATE SET
    name = EXCLUDED.name,
    privilege_type = EXCLUDED.privilege_type;

INSERT INTO iam.menus (menu_key, label, path, icon, section, sort_order, privilege_id, is_group, parent_id)
VALUES
    (
        'user-management',
        'Users',
        '/system/users',
        'Users',
        'Administration',
        17,
        (SELECT id FROM iam.privileges WHERE privilege_code = 'menu:user-management'),
        FALSE,
        (SELECT id FROM iam.menus WHERE menu_key = 'system-management')
    )
ON CONFLICT (menu_key) DO UPDATE SET
    label = EXCLUDED.label,
    path = EXCLUDED.path,
    icon = EXCLUDED.icon,
    section = EXCLUDED.section,
    sort_order = EXCLUDED.sort_order,
    privilege_id = EXCLUDED.privilege_id,
    is_group = EXCLUDED.is_group,
    parent_id = EXCLUDED.parent_id;

INSERT INTO iam.role_menu_privileges (role_id, privilege_id)
SELECT r.id, p.id
FROM iam.roles r
CROSS JOIN iam.privileges p
WHERE r.role_name = 'SYSTEM_ADMIN'
  AND p.privilege_code = 'menu:user-management'
ON CONFLICT DO NOTHING;

INSERT INTO iam.role_menu_privileges (role_id, privilege_id)
SELECT r.id, p.id
FROM iam.roles r
CROSS JOIN iam.privileges p
WHERE r.role_name = 'IT_ADMIN'
  AND p.privilege_code = 'menu:user-management'
ON CONFLICT DO NOTHING;



-- === MIGRATION: 010_user_profile_photo.sql ===
-- User profile photo (stored on disk; path in DB)
ALTER TABLE iam.users
    ADD COLUMN IF NOT EXISTS profile_photo_path VARCHAR(512);



-- === MIGRATION: 011_mfa_totp.sql ===
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



-- === MIGRATION: 012_seed_security_settings_menu.sql ===
-- Superseded by 013_system_management_configuration.sql (valid menu rows + system-configuration hub).
-- Kept as no-op so migration order stays stable for environments that already ran 012.
SELECT 1;



-- === MIGRATION: 013_system_management_configuration.sql ===
-- System Management: configuration hub + Security & MFA under the admin menu group
-- Fixes 012_seed_security_settings_menu.sql (invalid privilege_code column on iam.menus)

INSERT INTO iam.privileges (privilege_code, name, description, module, privilege_type)
VALUES
    (
        'menu:system-configuration',
        'System configuration',
        'Platform-wide settings (security, MFA policy, future options)',
        'System',
        'MENU'
    )
ON CONFLICT (privilege_code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    privilege_type = EXCLUDED.privilege_type;

-- Remove broken menu row from 012 if it was applied (menus have privilege_id, not privilege_code)
DELETE FROM iam.menus WHERE menu_key = 'system:security';

INSERT INTO iam.menus (menu_key, label, path, icon, section, sort_order, privilege_id, is_group, parent_id)
VALUES
    (
        'system-configuration',
        'System configuration',
        '/system/configuration',
        'SlidersHorizontal',
        'Administration',
        9,
        (SELECT id FROM iam.privileges WHERE privilege_code = 'menu:system-configuration'),
        FALSE,
        (SELECT id FROM iam.menus WHERE menu_key = 'system-management')
    ),
    (
        'security-policy',
        'Security & MFA',
        '/system/security',
        'ShieldCheck',
        'Administration',
        10,
        (SELECT id FROM iam.privileges WHERE privilege_code = 'menu:system-configuration'),
        FALSE,
        (SELECT id FROM iam.menus WHERE menu_key = 'system-management')
    )
ON CONFLICT (menu_key) DO UPDATE SET
    label = EXCLUDED.label,
    path = EXCLUDED.path,
    icon = EXCLUDED.icon,
    section = EXCLUDED.section,
    sort_order = EXCLUDED.sort_order,
    privilege_id = EXCLUDED.privilege_id,
    is_group = EXCLUDED.is_group,
    parent_id = EXCLUDED.parent_id,
    is_active = TRUE;

INSERT INTO iam.role_menu_privileges (role_id, privilege_id)
SELECT r.id, p.id
FROM iam.roles r
CROSS JOIN iam.privileges p
WHERE r.role_name IN ('SYSTEM_ADMIN', 'IT_ADMIN')
  AND p.privilege_code = 'menu:system-configuration'
ON CONFLICT DO NOTHING;



-- === MIGRATION: 014_remove_security_policy_menu.sql ===
-- Security & MFA is reached from System configuration hub, not a separate sidebar item.

UPDATE iam.menus
SET is_active = FALSE
WHERE menu_key = 'security-policy';



-- === MIGRATION: 015_user_notifications.sql ===
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



-- === MIGRATION: 016_mobile_widgets.sql ===
-- Mobile app widgets (admin-controlled modules/features)

INSERT INTO iam.privileges (privilege_code, name, description, module, privilege_type)
VALUES (
    'menu:mobile-widget-management',
    'Mobile Widget Management',
    'Configure which modules appear in the IIP mobile app',
    'system',
    'MENU'
)
ON CONFLICT (privilege_code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    privilege_type = EXCLUDED.privilege_type;

CREATE TABLE IF NOT EXISTS iam.mobile_widgets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    widget_key      VARCHAR(100) NOT NULL UNIQUE,
    label           VARCHAR(255) NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    icon            VARCHAR(100) NOT NULL DEFAULT 'LayoutGrid',
    menu_key        VARCHAR(100),
    privilege_code  VARCHAR(150),
    mobile_route    VARCHAR(255) NOT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mobile_widgets_active_sort
    ON iam.mobile_widgets (is_active, sort_order);

-- Sidebar menu (deactivated in 017 — use System configuration → Mobile App Widgets)
INSERT INTO iam.menus (menu_key, label, path, icon, section, sort_order, privilege_id, is_group, parent_id)
VALUES (
    'mobile-widget-management',
    'Mobile App Widgets',
    '/system/mobile-widgets',
    'Smartphone',
    'Administration',
    18,
    (SELECT id FROM iam.privileges WHERE privilege_code = 'menu:mobile-widget-management'),
    FALSE,
    (SELECT id FROM iam.menus WHERE menu_key = 'system-management')
)
ON CONFLICT (menu_key) DO UPDATE SET
    label = EXCLUDED.label,
    path = EXCLUDED.path,
    icon = EXCLUDED.icon,
    privilege_id = EXCLUDED.privilege_id,
    sort_order = EXCLUDED.sort_order;

INSERT INTO iam.role_menu_privileges (role_id, privilege_id)
SELECT r.id, p.id
FROM iam.roles r
CROSS JOIN iam.privileges p
WHERE r.role_name IN ('SYSTEM_ADMIN', 'IT_ADMIN')
  AND p.privilege_code = 'menu:mobile-widget-management'
ON CONFLICT DO NOTHING;

-- Default mobile widgets (admin can disable individually)
INSERT INTO iam.mobile_widgets (widget_key, label, description, icon, menu_key, privilege_code, mobile_route, sort_order)
VALUES
    ('dashboard', 'Dashboard', 'Overview and quick stats', 'LayoutDashboard', 'dashboard', NULL, '/dashboard', 10),
    ('notifications', 'Notifications', 'System alerts and policy updates', 'Bell', NULL, NULL, '/notifications', 20),
    ('profile', 'My Profile', 'Account details and security settings', 'User', NULL, NULL, '/profile', 30),
    ('watch-console', 'Watch Console', 'Real-time monitoring console', 'Radio', 'watch-console', 'menu:watch-console', '/watch-console', 40),
    ('cases', 'Intelligence Cases', 'Case files and dossiers', 'FolderOpen', 'cases', 'menu:cases', '/cases', 50),
    ('analyst-workbench', 'Analyst Workbench', 'Analysis tools and workflows', 'Bot', 'analyst-workbench', 'menu:analyst-workbench', '/analyst-workbench', 60),
    ('hotspot-console', 'Hotspot Console', 'Geospatial hotspot analysis', 'MapPin', 'hotspot-console', 'menu:hotspot-console', '/hotspot-console', 70),
    ('kg-canvas', 'Knowledge Graph', 'Entity relationship graph', 'Network', 'kg-canvas', 'menu:kg-canvas', '/kg-canvas', 80),
    ('humint-vault', 'HUMINT Vault', 'Human intelligence sources', 'Lock', 'humint-vault', 'menu:humint-vault', '/humint-vault', 90)
ON CONFLICT (widget_key) DO NOTHING;



-- === MIGRATION: 017_remove_mobile_widget_menu.sql ===
-- Mobile App Widgets is reached from System configuration hub, not a separate sidebar item.

UPDATE iam.menus
SET is_active = FALSE
WHERE menu_key = 'mobile-widget-management';



-- === MIGRATION: 018_seed_suspect_dossier_menu.sql ===
-- Suspect & dossier management menu (UI-first; data APIs follow)
INSERT INTO iam.privileges (privilege_code, name, description, module, privilege_type)
VALUES
    ('menu:suspect-dossier', 'Suspect & Dossier', 'Access suspect and dossier management', 'Intelligence', 'MENU'),
    ('data:suspect-dossier', 'Suspect Dossiers', 'Suspect dossier records', 'Intelligence', 'DATA')
ON CONFLICT (privilege_code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    privilege_type = EXCLUDED.privilege_type,
    module = EXCLUDED.module;

INSERT INTO iam.privilege_actions (privilege_id, action_code, action_label, sort_order)
SELECT p.id, a.code, a.label, a.ord
FROM iam.privileges p
JOIN (VALUES
    ('data:suspect-dossier', 'READ', 'Read', 1),
    ('data:suspect-dossier', 'CREATE', 'Create', 2),
    ('data:suspect-dossier', 'UPDATE', 'Update', 3),
    ('data:suspect-dossier', 'DELETE', 'Delete', 4),
    ('data:suspect-dossier', 'EXPORT', 'Export', 5)
) AS a(priv_code, code, label, ord) ON p.privilege_code = a.priv_code
ON CONFLICT (privilege_id, action_code) DO NOTHING;

INSERT INTO iam.menus (menu_key, label, path, icon, section, sort_order, privilege_id, is_group, parent_id)
VALUES
    (
        'suspect-dossier',
        'Suspect & Dossier',
        '/suspects',
        'FileSearch',
        'Menu',
        35,
        (SELECT id FROM iam.privileges WHERE privilege_code = 'menu:suspect-dossier'),
        FALSE,
        NULL
    )
ON CONFLICT (menu_key) DO UPDATE SET
    label = EXCLUDED.label,
    path = EXCLUDED.path,
    icon = EXCLUDED.icon,
    section = EXCLUDED.section,
    sort_order = EXCLUDED.sort_order,
    privilege_id = EXCLUDED.privilege_id,
    is_group = EXCLUDED.is_group,
    parent_id = EXCLUDED.parent_id;

INSERT INTO iam.role_menu_privileges (role_id, privilege_id)
SELECT r.id, p.id
FROM iam.roles r
CROSS JOIN iam.privileges p
WHERE r.role_name IN ('SYSTEM_ADMIN', 'IT_ADMIN', 'ANALYST', 'SUPERVISOR', 'WATCH_OFFICER')
  AND p.privilege_code = 'menu:suspect-dossier'
ON CONFLICT DO NOTHING;

INSERT INTO iam.role_privilege_actions (role_id, privilege_id, action_id)
SELECT r.id, pa.privilege_id, pa.id
FROM iam.roles r
JOIN iam.privileges p ON p.privilege_code = 'data:suspect-dossier'
JOIN iam.privilege_actions pa ON pa.privilege_id = p.id
WHERE r.role_name IN ('SYSTEM_ADMIN', 'ANALYST', 'SUPERVISOR')
ON CONFLICT DO NOTHING;



-- === MIGRATION: 019_suspect_dossier_tables.sql ===
-- Suspect & dossier persistence (intelligence domain)

CREATE TABLE IF NOT EXISTS intelligence.suspects (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    criminal_name   VARCHAR(255) NOT NULL,
    alias_name      VARCHAR(255),
    gender          VARCHAR(50),
    fathers_name    VARCHAR(255),
    date_of_birth   DATE,
    age             INTEGER,
    year_of_birth   INTEGER,
    place_of_birth  VARCHAR(255),
    religion        VARCHAR(100),
    category        VARCHAR(50),
    created_by      UUID NOT NULL REFERENCES iam.users(id),
    office_id       UUID REFERENCES iam.offices(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suspects_criminal_name
    ON intelligence.suspects (lower(criminal_name));

CREATE TABLE IF NOT EXISTS intelligence.suspect_dossiers (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suspect_id        UUID NOT NULL REFERENCES intelligence.suspects(id) ON DELETE CASCADE,
    dossier_draft_id  UUID,
    status            VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED'
                      CHECK (status IN ('SUBMITTED', 'ARCHIVED')),
    submitted_by      UUID NOT NULL REFERENCES iam.users(id),
    office_id         UUID REFERENCES iam.offices(id),
    submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suspect_dossiers_suspect
    ON intelligence.suspect_dossiers (suspect_id);

CREATE TABLE IF NOT EXISTS intelligence.suspect_addresses (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suspect_id        UUID NOT NULL REFERENCES intelligence.suspects(id) ON DELETE CASCADE,
    is_permanent      BOOLEAN NOT NULL DEFAULT TRUE,
    house_no          VARCHAR(100),
    house_name        VARCHAR(255),
    street_name       VARCHAR(255),
    locality          VARCHAR(255),
    tehsil            VARCHAR(255),
    village_town_city VARCHAR(255),
    pincode           VARCHAR(20),
    latitude          NUMERIC(10, 7),
    longitude         NUMERIC(10, 7),
    country           VARCHAR(100),
    state             VARCHAR(100),
    district          VARCHAR(100),
    police_station    VARCHAR(255),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intelligence.suspect_contacts (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suspect_id    UUID NOT NULL REFERENCES intelligence.suspects(id) ON DELETE CASCADE,
    contact_type  VARCHAR(20) NOT NULL
                  CHECK (contact_type IN ('MOBILE', 'LANDLINE', 'EMAILID')),
    value         VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intelligence.suspect_social_accounts (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suspect_id    UUID NOT NULL REFERENCES intelligence.suspects(id) ON DELETE CASCADE,
    platform      VARCHAR(50) NOT NULL,
    details       TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intelligence.suspect_relatives (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suspect_id    UUID NOT NULL REFERENCES intelligence.suspects(id) ON DELETE CASCADE,
    name          VARCHAR(255) NOT NULL,
    relation      VARCHAR(100),
    gender        VARCHAR(50),
    occupation    VARCHAR(255),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intelligence.suspect_photos (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suspect_id      UUID NOT NULL REFERENCES intelligence.suspects(id) ON DELETE CASCADE,
    dossier_id      UUID NOT NULL REFERENCES intelligence.suspect_dossiers(id) ON DELETE CASCADE,
    photo_id        UUID NOT NULL,
    pose_type       VARCHAR(30) NOT NULL,
    storage_key     VARCHAR(512) NOT NULL,
    face_id         UUID,
    detected_pose   VARCHAR(30),
    face_detected   BOOLEAN NOT NULL DEFAULT FALSE,
    face_count      INTEGER,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (dossier_id, photo_id)
);

CREATE INDEX IF NOT EXISTS idx_suspect_photos_suspect
    ON intelligence.suspect_photos (suspect_id);

CREATE INDEX IF NOT EXISTS idx_suspect_photos_face
    ON intelligence.suspect_photos (face_id)
    WHERE face_id IS NOT NULL;



-- === MIGRATION: 020_suspect_master_child.sql ===
-- Parent (master) suspect profiles and child dossier linking across units

CREATE TABLE IF NOT EXISTS intelligence.suspect_masters (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    display_name    VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suspect_masters_display_name
    ON intelligence.suspect_masters (lower(display_name));

ALTER TABLE intelligence.suspect_dossiers
    ADD COLUMN IF NOT EXISTS master_suspect_id UUID REFERENCES intelligence.suspect_masters(id);

ALTER TABLE intelligence.suspect_dossiers
    ADD COLUMN IF NOT EXISTS link_status VARCHAR(30) NOT NULL DEFAULT 'STANDALONE';

ALTER TABLE intelligence.suspect_dossiers
    DROP CONSTRAINT IF EXISTS suspect_dossiers_link_status_check;

ALTER TABLE intelligence.suspect_dossiers
    ADD CONSTRAINT suspect_dossiers_link_status_check
    CHECK (link_status IN ('STANDALONE', 'LINKED', 'PENDING_LINK_REVIEW'));

CREATE INDEX IF NOT EXISTS idx_suspect_dossiers_master
    ON intelligence.suspect_dossiers (master_suspect_id);

CREATE INDEX IF NOT EXISTS idx_suspect_dossiers_office
    ON intelligence.suspect_dossiers (office_id);

CREATE TABLE IF NOT EXISTS intelligence.suspect_link_decisions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dossier_id          UUID REFERENCES intelligence.suspect_dossiers(id) ON DELETE SET NULL,
    dossier_draft_id    UUID,
    matched_master_id   UUID REFERENCES intelligence.suspect_masters(id),
    matched_dossier_id  UUID REFERENCES intelligence.suspect_dossiers(id),
    face_similarity     DOUBLE PRECISION,
    match_score         INTEGER,
    decision            VARCHAR(20) NOT NULL
                        CHECK (decision IN ('CONFIRMED_LINK', 'REJECTED_LINK')),
    decided_by          UUID NOT NULL REFERENCES iam.users(id),
    decided_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrate existing flat records: one master per legacy suspect (same id)
INSERT INTO intelligence.suspect_masters (id, display_name, created_at, updated_at)
SELECT s.id, s.criminal_name, s.created_at, s.updated_at
FROM intelligence.suspects s
ON CONFLICT (id) DO NOTHING;

UPDATE intelligence.suspect_dossiers d
SET master_suspect_id = d.suspect_id,
    link_status = 'STANDALONE'
WHERE d.master_suspect_id IS NULL;

ALTER TABLE intelligence.suspect_dossiers
    ALTER COLUMN master_suspect_id SET NOT NULL;



-- === MIGRATION: 021_seed_suspect_master_privileges.sql ===
-- Cross-unit master profile read for supervisors and system admins

INSERT INTO iam.privilege_actions (privilege_id, action_code, action_label, sort_order)
SELECT p.id, 'READ_MASTER', 'Read master profile', 6
FROM iam.privileges p
WHERE p.privilege_code = 'data:suspect-dossier'
ON CONFLICT (privilege_id, action_code) DO NOTHING;

INSERT INTO iam.privilege_actions (privilege_id, action_code, action_label, sort_order)
SELECT p.id, 'READ_CROSS_UNIT', 'Read other units', 7
FROM iam.privileges p
WHERE p.privilege_code = 'data:suspect-dossier'
ON CONFLICT (privilege_id, action_code) DO NOTHING;

INSERT INTO iam.role_privilege_actions (role_id, privilege_id, action_id)
SELECT r.id, pa.privilege_id, pa.id
FROM iam.roles r
JOIN iam.privileges p ON p.privilege_code = 'data:suspect-dossier'
JOIN iam.privilege_actions pa ON pa.privilege_id = p.id
WHERE r.role_name IN ('SYSTEM_ADMIN', 'SUPERVISOR')
  AND pa.action_code IN ('READ_MASTER', 'READ_CROSS_UNIT')
ON CONFLICT DO NOTHING;

-- Analysts can read master profile (consolidated) but only their unit's child dossiers by default
INSERT INTO iam.role_privilege_actions (role_id, privilege_id, action_id)
SELECT r.id, pa.privilege_id, pa.id
FROM iam.roles r
JOIN iam.privileges p ON p.privilege_code = 'data:suspect-dossier'
JOIN iam.privilege_actions pa ON pa.privilege_id = p.id
WHERE r.role_name = 'ANALYST'
  AND pa.action_code = 'READ_MASTER'
ON CONFLICT DO NOTHING;



-- === MIGRATION: 022_suspect_link_decisions_updated_at.sql ===
-- Align suspect_link_decisions with Base ORM (id, created_at, updated_at)

ALTER TABLE intelligence.suspect_link_decisions
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();



-- === MIGRATION: 023_suspect_multiple_addresses.sql ===
-- Allow one permanent and one present address per suspect

ALTER TABLE intelligence.suspect_addresses
    DROP CONSTRAINT IF EXISTS suspect_addresses_suspect_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_suspect_addresses_suspect_permanent
    ON intelligence.suspect_addresses (suspect_id, is_permanent);



-- === MIGRATION: 024_quick_suspect_captures.sql ===
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



-- === MIGRATION: 025_suspect_fingerprints.sql ===
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


