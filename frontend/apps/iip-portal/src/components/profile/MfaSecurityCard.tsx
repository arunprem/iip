import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, ShieldCheck, ShieldOff } from 'lucide-react';
import {
  disableMfa,
  enableMfa,
  fetchMfaStatus,
  startMfaSetup,
  type MfaSetupPayload,
} from '../../api/mfa';
import { AdminButton } from '../admin/AdminButton';
import { MfaSetupModal } from '../mfa/MfaSetupModal';
import { TotpCodeInput } from '../mfa/TotpCodeInput';
import { getApiErrorMessage } from '../../hooks/useIamRoles';
import { showToast } from '../../stores/toastStore';

export function MfaSecurityCard() {
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<MfaSetupPayload | null>(null);
  const [disableCode, setDisableCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ['mfa-status'],
    queryFn: async () => {
      const res = await fetchMfaStatus();
      return res.data;
    },
  });

  const setupMutation = useMutation({
    mutationFn: async () => {
      const res = await startMfaSetup();
      return res.data;
    },
    onSuccess: (data) => {
      setSetup(data);
      setError(null);
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const enableMutation = useMutation({
    mutationFn: async (code: string) => {
      if (!setup?.setup_token) throw new Error('Setup expired');
      await enableMfa(setup.setup_token, code);
    },
    onSuccess: () => {
      setSetup(null);
      setError(null);
      showToast('success', 'Two-factor authentication is now enabled.');
      void queryClient.invalidateQueries({ queryKey: ['mfa-status'] });
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const disableMutation = useMutation({
    mutationFn: async (code: string) => disableMfa(code),
    onSuccess: () => {
      setDisableCode('');
      setError(null);
      showToast('success', 'Two-factor authentication has been disabled.');
      void queryClient.invalidateQueries({ queryKey: ['mfa-status'] });
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  if (isLoading || !status) {
    return (
      <section className="dashboard-card p-6">
        <p className="text-sm text-iip-text-muted">Loading security settings…</p>
      </section>
    );
  }

  const enrolled = status.mfa_enrolled;

  return (
    <>
    <section className="dashboard-card p-6">
      <div className="flex items-start gap-4 mb-6">
        <div
          className={`shrink-0 p-3 rounded-xl ${
            enrolled ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-iip-primary/10 text-iip-primary'
          }`}
        >
          {enrolled ? <ShieldCheck size={22} /> : <Shield size={22} />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-iip-text">Two-factor authentication</h2>
          <p className="text-xs text-iip-text-muted mt-1 leading-relaxed">
            Protect your account with a time-based code from Google Authenticator or a compatible app.
          </p>
          {status.force_mfa && (
            <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
              Your organization requires two-factor authentication for all users.
            </p>
          )}
        </div>
        <span
          className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
            enrolled
              ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300'
              : 'bg-iip-bg text-iip-text-muted border-iip-border'
          }`}
        >
          {enrolled ? 'On' : 'Off'}
        </span>
      </div>

      {error && (
        <div className="alert-danger mb-4" role="alert">
          <span>{error}</span>
        </div>
      )}

      {!enrolled ? (
        <div className="space-y-4">
          <p className="text-sm text-iip-text-muted">
            Enable 2FA to add a second step when signing in. You will scan a QR code once, then use codes from
            your authenticator app.
          </p>
          <AdminButton
            variant="primary"
            onClick={() => setupMutation.mutate()}
            disabled={setupMutation.isPending || Boolean(setup)}
          >
            <Shield size={16} aria-hidden />
            {setupMutation.isPending ? 'Preparing…' : 'Set up authenticator'}
          </AdminButton>
        </div>
      ) : (
        <div className="space-y-4 border-t border-iip-border pt-5">
          {status.can_disable ? (
            <>
              <p className="text-sm text-iip-text-muted">
                Enter a current authenticator code to turn off two-factor authentication.
              </p>
              <TotpCodeInput value={disableCode} onChange={setDisableCode} disabled={disableMutation.isPending} />
              <AdminButton
                variant="danger"
                onClick={() => {
                  if (disableCode.length !== 6) return;
                  disableMutation.mutate(disableCode);
                }}
                disabled={disableMutation.isPending || disableCode.length !== 6}
              >
                <ShieldOff size={16} aria-hidden />
                {disableMutation.isPending ? 'Disabling…' : 'Disable two-factor'}
              </AdminButton>
            </>
          ) : (
            <p className="text-sm text-iip-text-muted">
              Disabling 2FA is not allowed while your organization enforces it for all accounts.
            </p>
          )}
        </div>
      )}
    </section>

    {setup && (
      <MfaSetupModal
        open
        setup={setup}
        error={error}
        isLoading={enableMutation.isPending}
        onComplete={(code) => enableMutation.mutate(code)}
        onClose={() => setSetup(null)}
      />
    )}
    </>
  );
}
