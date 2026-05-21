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
