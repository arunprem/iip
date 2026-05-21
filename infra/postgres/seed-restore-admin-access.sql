-- Emergency restore: admin user office access with SYSTEM_ADMIN at PHQ.
-- Run: docker exec -i iip-postgres psql -U iip_user -d iip_db < infra/postgres/seed-restore-admin-access.sql

-- Keep legacy global SYSTEM_ADMIN (used when no office assignments exist)
INSERT INTO iam.user_roles (user_id, role_id, justification)
SELECT u.id, r.id, 'Bootstrap system administrator'
FROM iam.users u
JOIN iam.roles r ON r.role_name = 'SYSTEM_ADMIN'
WHERE u.username = 'admin'
ON CONFLICT DO NOTHING;

-- Upgrade every existing office assignment for admin to SYSTEM_ADMIN
UPDATE iam.user_office_roles uor
SET role_id = (SELECT id FROM iam.roles WHERE role_name = 'SYSTEM_ADMIN')
WHERE user_id = (SELECT id FROM iam.users WHERE username = 'admin');

-- Ensure PHQ (Police Headquarters) assignment exists
INSERT INTO iam.user_office_roles (user_id, office_id, role_id)
SELECT u.id, o.id, r.id
FROM iam.users u
CROSS JOIN iam.roles r
CROSS JOIN iam.offices o
WHERE u.username = 'admin'
  AND r.role_name = 'SYSTEM_ADMIN'
  AND o.office_code = 'PHQ'
ON CONFLICT (user_id, office_id) DO UPDATE SET
    role_id = EXCLUDED.role_id;
