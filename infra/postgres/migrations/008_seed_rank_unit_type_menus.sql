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
