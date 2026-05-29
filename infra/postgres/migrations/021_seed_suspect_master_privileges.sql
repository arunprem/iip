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
