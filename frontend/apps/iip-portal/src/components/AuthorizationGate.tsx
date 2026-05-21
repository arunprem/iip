import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useNavMenus } from '../hooks/useNavMenus';
import { collectMenuPaths, isPathAuthorized } from '../utils/routeAuthorization';

/**
 * Blocks navigation to routes the user cannot access (menu-driven).
 * Always allows /unauthorized and /dashboard.
 */
export function AuthorizationGate() {
  const location = useLocation();
  const { data: menus, isLoading, isFetching } = useNavMenus();

  if (location.pathname === '/unauthorized') {
    return <Outlet />;
  }

  if (isLoading || isFetching) {
    return (
      <div className="dashboard-card p-8 text-iip-text-muted text-sm">Checking access…</div>
    );
  }

  const menuPaths = collectMenuPaths(menus ?? []);
  if (!isPathAuthorized(location.pathname, menuPaths)) {
    return (
      <Navigate
        to="/unauthorized"
        replace
        state={{ from: location.pathname, reason: 'menu' as const }}
      />
    );
  }

  return <Outlet />;
}
