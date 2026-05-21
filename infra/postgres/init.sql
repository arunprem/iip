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
