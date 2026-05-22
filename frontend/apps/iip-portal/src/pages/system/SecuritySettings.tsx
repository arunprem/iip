import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Shield, ShieldAlert } from 'lucide-react';
import { fetchMfaPolicy, updateMfaPolicy } from '../../api/mfa';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { getApiErrorMessage } from '../../hooks/useIamRoles';
import { showToast } from '../../stores/toastStore';

export default function SecuritySettings() {
  const queryClient = useQueryClient();
  const [forceMfa, setForceMfa] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['mfa-policy'],
    queryFn: async () => {
      const res = await fetchMfaPolicy();
      return res.data;
    },
  });

  useEffect(() => {
    if (data) setForceMfa(data.force_mfa);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await updateMfaPolicy(enabled);
      return res.data;
    },
    onSuccess: (result) => {
      setForceMfa(result.force_mfa);
      showToast('success', result.force_mfa ? 'Mandatory 2FA enabled for all users.' : 'Mandatory 2FA turned off.');
      void queryClient.invalidateQueries({ queryKey: ['mfa-policy'] });
      void queryClient.invalidateQueries({ queryKey: ['mfa-status'] });
    },
    onError: (err) => showToast('error', getApiErrorMessage(err)),
  });

  const dirty = data != null && forceMfa !== data.force_mfa;

  return (
    <AdminPageLayout
      title="Security & MFA"
      description="Organization-wide authentication requirements for the IIP portal."
      icon={Shield}
      actions={
        <Link
          to="/system/configuration"
          className="btn btn-secondary btn-sm inline-flex items-center gap-1.5"
        >
          <ArrowLeft size={14} aria-hidden />
          System configuration
        </Link>
      }
    >
      <section className="dashboard-card max-w-2xl overflow-hidden">
        <div className="p-6 border-b border-iip-border bg-gradient-to-r from-iip-primary/[0.04] to-transparent">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-iip-primary/10 text-iip-primary">
              <Shield size={24} aria-hidden />
            </div>
            <div>
              <h2 className="text-base font-semibold text-iip-text">Two-factor authentication (2FA)</h2>
              <p className="text-sm text-iip-text-muted mt-1 leading-relaxed">
                When enabled, every user must complete Google Authenticator (TOTP) setup and enter a code at
                sign-in. Users cannot turn off 2FA on their own while this policy is active.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {isLoading ? (
            <p className="text-sm text-iip-text-muted">Loading policy…</p>
          ) : (
            <>
              <label className="flex items-start gap-4 cursor-pointer group">
                <div className="relative mt-0.5 shrink-0">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={forceMfa}
                    disabled={saveMutation.isPending}
                    onChange={(e) => setForceMfa(e.target.checked)}
                  />
                  <div className="w-11 h-6 rounded-full bg-iip-border peer-checked:bg-iip-primary transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-iip-text group-hover:text-iip-primary transition-colors">
                    Require 2FA for all users
                  </span>
                  <p className="text-xs text-iip-text-muted mt-1">
                    New and existing users must enroll on next login if they have not already.
                  </p>
                </div>
              </label>

              {forceMfa && (
                <div className="flex gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200">
                  <ShieldAlert size={20} className="shrink-0 mt-0.5" aria-hidden />
                  <p className="text-xs leading-relaxed">
                    Users who have not set up an authenticator will be guided through enrollment immediately
                    after password verification. Ensure help desk staff are ready to assist with setup issues.
                  </p>
                </div>
              )}

              <div className="admin-form-panel-footer -mx-6 -mb-6 mt-2">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={saveMutation.isPending || !dirty}
                  onClick={() => data && setForceMfa(data.force_mfa)}
                >
                  Reset
                </button>
                <span className="admin-form-actions-spacer flex-1" aria-hidden />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={saveMutation.isPending || !dirty}
                  onClick={() => saveMutation.mutate(forceMfa)}
                >
                  {saveMutation.isPending ? 'Saving…' : 'Save policy'}
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </AdminPageLayout>
  );
}
