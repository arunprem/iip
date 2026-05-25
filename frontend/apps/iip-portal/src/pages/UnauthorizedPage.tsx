import { useLocation, useNavigate } from 'react-router-dom';
import { Home, ShieldOff } from 'lucide-react';
import { AdminButton } from '../components/admin/AdminButton';
import { useAuthStore } from '../stores/authStore';
import { selectCurrentOfficeRole } from '../stores/authStore';

export type UnauthorizedReason = 'menu' | 'admin_required' | 'unknown';

type UnauthorizedState = {
  from?: string;
  reason?: UnauthorizedReason;
};

function messageForReason(_reason: UnauthorizedReason | undefined, _from: string | undefined): string {
  return 'You do not have permission to open this page. Choose a module from the sidebar or contact your administrator if you need access.';
}

export default function UnauthorizedPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as UnauthorizedState;
  const officeRole = useAuthStore(selectCurrentOfficeRole);
  const currentOfficeId = useAuthStore((s) => s.currentOfficeId);
  const offices = useAuthStore((s) => s.user?.offices ?? []);

  const currentOffice = offices.find((o) => o.office_id === currentOfficeId);
  const reason = state.reason ?? 'unknown';
  const from = state.from ?? location.pathname;

  return (
    <div className="min-h-[min(70vh,640px)] flex items-center justify-center p-4">
      <div className="dashboard-card max-w-lg w-full p-8 md:p-10 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-600">
          <ShieldOff size={28} aria-hidden />
        </div>
        <h1 className="text-xl font-bold text-iip-text">Access not authorized</h1>
        <p className="mt-3 text-sm text-iip-text-muted leading-relaxed text-left">
          {messageForReason(reason, from)}
        </p>
        {(currentOffice || officeRole) && (
          <p className="mt-4 text-xs text-iip-text-muted text-left rounded-lg border border-iip-border bg-iip-bg/50 px-3 py-2">
            Current office:{' '}
            <span className="font-medium text-iip-text">
              {currentOffice?.office_name ?? '—'}
            </span>
            {officeRole ? (
              <>
                {' '}
                · Role: <span className="font-medium text-iip-text">{officeRole}</span>
              </>
            ) : null}
          </p>
        )}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <AdminButton variant="primary" size="sm" onClick={() => navigate('/dashboard', { replace: true })}>
            <Home size={15} aria-hidden />
            Go to dashboard
          </AdminButton>
          <AdminButton variant="secondary" size="sm" onClick={() => navigate(-1)}>
            Go back
          </AdminButton>
        </div>
        <p className="mt-6 text-xs text-iip-text-muted">
          Need access? Contact your system administrator.
        </p>
      </div>
    </div>
  );
}
