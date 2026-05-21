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
