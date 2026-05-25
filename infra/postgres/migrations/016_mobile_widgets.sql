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

-- Admin menu under System Management
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
