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
