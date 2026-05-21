import type { NavMenuItem } from '../hooks/useNavMenus';

/** Paths always reachable when signed in (no menu privilege required). */
export const ALWAYS_ALLOWED_PATHS = ['/dashboard', '/unauthorized', '/profile'] as const;

export function collectMenuPaths(items: NavMenuItem[]): string[] {
  const paths: string[] = [];
  const walk = (nodes: NavMenuItem[]) => {
    for (const node of nodes) {
      if (node.path) paths.push(node.path);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(items);
  return paths;
}

/**
 * Returns true if the user may open this URL based on allowed menu paths.
 * Supports nested routes (e.g. /cases/abc matches menu path /cases).
 */
export function isPathAuthorized(pathname: string, menuPaths: string[]): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';

  for (const allowed of ALWAYS_ALLOWED_PATHS) {
    if (path === allowed) return true;
  }

  if (path === '/') return true;

  for (const menuPath of menuPaths) {
    if (!menuPath) continue;
    const base = menuPath.replace(/\/+$/, '') || '/';
    if (path === base) return true;
    if (base !== '/' && path.startsWith(`${base}/`)) return true;
  }

  return false;
}
