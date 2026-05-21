import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { selectCurrentOfficeRole } from '../stores/authStore';

const ADMIN_ROLES = ['SYSTEM_ADMIN', 'IT_ADMIN'];

export function SystemAdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const officeRole = useAuthStore(selectCurrentOfficeRole);

  if (accessToken && !user) {
    return (
      <div className="dashboard-card p-8 text-iip-text-muted text-sm">Loading access...</div>
    );
  }

  if (!officeRole || !ADMIN_ROLES.includes(officeRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
