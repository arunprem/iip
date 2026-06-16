-- Seed Threat Profiler menu and privileges
INSERT INTO iam.privileges (id, privilege_code, name, description, module, privilege_type, is_active)
VALUES (
    '507119ff-3592-482d-862d-94bb9162ab8f', 
    'menu:threat-profiler', 
    'Threat Profiler', 
    'Access AI Threat Profiler module', 
    'Menu', 
    'MENU', 
    TRUE
)
ON CONFLICT (privilege_code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

INSERT INTO iam.menus (menu_key, label, path, icon, section, sort_order, privilege_id, is_group, parent_id, is_active)
VALUES (
    'threat-profiler',
    'Threat Profiler',
    '/threat-profiler',
    'Radar',
    'Menu',
    44,
    (SELECT id FROM iam.privileges WHERE privilege_code = 'menu:threat-profiler'),
    FALSE,
    (SELECT id FROM iam.menus WHERE menu_key = 'analytics'),
    TRUE
)
ON CONFLICT (menu_key) DO UPDATE SET
    label = EXCLUDED.label,
    path = EXCLUDED.path,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order,
    privilege_id = EXCLUDED.privilege_id,
    parent_id = EXCLUDED.parent_id;

INSERT INTO iam.role_menu_privileges (role_id, privilege_id)
SELECT r.id, p.id
FROM iam.roles r
CROSS JOIN iam.privileges p
WHERE r.role_name IN ('SYSTEM_ADMIN', 'ANALYST', 'SUPERVISOR')
  AND p.privilege_code = 'menu:threat-profiler'
ON CONFLICT DO NOTHING;
