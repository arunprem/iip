import { SUPER_ADMIN_ROLES } from '../config/navigation';

const ROLE_PRIORITY = [
  'SYSTEM_ADMIN',
  'IT_ADMIN',
  'SUPERVISOR',
  'WATCH_OFFICER',
  'ANALYST',
  'AUDITOR',
] as const;

/** Highest-privilege role for display; SYSTEM_ADMIN wins when present. */
export function resolvePrimaryRole(roles: string[] | undefined): string {
  if (!roles?.length) return 'USER';
  for (const role of ROLE_PRIORITY) {
    if (roles.includes(role)) return role;
  }
  return roles[0];
}

export function hasAnyRole(userRoles: string[] | undefined, allowedRoles: string[]): boolean {
  const roles = userRoles ?? [];
  if (roles.includes('SYSTEM_ADMIN')) return true;
  return allowedRoles.some((r) => roles.includes(r));
}

export function canAccessSystemManagement(userRoles: string[]): boolean {
  return hasAnyRole(userRoles, [...SUPER_ADMIN_ROLES]);
}

export function canAccessMenu(allowedRoles: string[], userRoles: string[]): boolean {
  return hasAnyRole(userRoles, allowedRoles);
}
