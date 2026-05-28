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
