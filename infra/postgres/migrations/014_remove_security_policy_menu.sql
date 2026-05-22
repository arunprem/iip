-- Security & MFA is reached from System configuration hub, not a separate sidebar item.

UPDATE iam.menus
SET is_active = FALSE
WHERE menu_key = 'security-policy';
