import { useState } from 'react';
import { Copy, ShieldCheck } from 'lucide-react';
import type { MfaSetupPayload } from '../../api/mfa';
import { AdminButton } from '../admin/AdminButton';
import { showToast } from '../../stores/toastStore';
import { TotpCodeInput } from './TotpCodeInput';

interface MfaEnrollmentStepProps {
  setup: MfaSetupPayload;
  error?: string | null;
  isLoading?: boolean;
  onComplete: (code: string) => void | Promise<void>;
  /** standalone = login; modal = profile dialog; embedded = inline card (legacy) */
  variant?: 'standalone' | 'embedded' | 'modal';
}

export function MfaEnrollmentStep({
  setup,
  error,
  isLoading = false,
  onComplete,
  variant = 'standalone',
}: MfaEnrollmentStepProps) {
  const [code, setCode] = useState('');
  const [showKey, setShowKey] = useState(false);

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(setup.manual_entry_key);
      showToast('success', 'Setup key copied.');
    } catch {
      showToast('error', 'Could not copy key.');
    }
  };

  const embedded = variant === 'embedded';
  const modal = variant === 'modal';

  return (
    <div className={modal ? 'w-full space-y-4' : embedded ? 'w-full space-y-5' : 'w-full max-w-lg mx-auto space-y-6'}>
      {!modal && (
        <div className={embedded ? 'flex items-start gap-4' : 'text-center'}>
          <div
            className={
              embedded
                ? 'shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-iip-primary/10 text-iip-primary'
                : 'inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-iip-primary/10 text-iip-primary mb-4'
            }
          >
            <ShieldCheck size={embedded ? 24 : 28} aria-hidden />
          </div>
          <div className={embedded ? 'min-w-0' : undefined}>
            <h2 className={embedded ? 'text-sm font-semibold text-iip-text' : 'text-xl font-bold text-iip-text'}>
              Set up authenticator
            </h2>
            <p className={`text-sm text-iip-text-muted ${embedded ? 'mt-1' : 'mt-2'}`}>
              Scan with Google Authenticator, Microsoft Authenticator, or any TOTP app.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="alert-danger" role="alert">
          <span>{error}</span>
        </div>
      )}

      <div
        className={
          modal
            ? 'space-y-4'
            : embedded
              ? 'flex flex-col sm:flex-row items-start gap-5 p-4 rounded-xl border border-iip-border bg-iip-bg/50'
              : 'dashboard-card p-6 flex flex-col sm:flex-row items-center gap-6'
        }
      >
        <div
          className={
            modal
              ? 'flex justify-center p-4 rounded-xl border border-iip-border bg-iip-bg/50'
              : 'shrink-0 p-3 rounded-xl bg-white border border-iip-border shadow-sm mx-auto sm:mx-0'
          }
        >
          <img
            src={setup.qr_code_data_url}
            alt="QR code for authenticator setup"
            className="h-40 w-40 max-w-full"
          />
        </div>
        <div
          className={
            modal
              ? 'text-sm text-iip-text-muted space-y-2.5'
              : 'text-sm text-iip-text-muted space-y-3 min-w-0 sm:flex-1'
          }
        >
          <p>1. Open your authenticator app and add a new account.</p>
          <p>2. Scan the QR code or enter the setup key manually.</p>
          <p>3. Enter the 6-digit code below to finish.</p>
          <button
            type="button"
            className="text-iip-primary text-xs font-semibold hover:underline"
            onClick={() => setShowKey((v) => !v)}
          >
            {showKey ? 'Hide setup key' : 'Show setup key'}
          </button>
          {showKey && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-iip-bg border border-iip-border font-mono text-xs text-iip-text break-all">
              <span className="flex-1">{setup.manual_entry_key}</span>
              <button
                type="button"
                onClick={() => void copyKey()}
                className="p-1.5 rounded-md hover:bg-iip-surface-hover text-iip-primary"
                title="Copy key"
              >
                <Copy size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === 6) void onComplete(code);
        }}
        className="space-y-4"
      >
        <TotpCodeInput
          value={code}
          onChange={setCode}
          disabled={isLoading}
          autoFocus
          align="center"
        />
        <AdminButton
          type="submit"
          variant="primary"
          className="w-full justify-center"
          disabled={isLoading || code.length !== 6}
        >
          {isLoading ? 'Activating…' : 'Activate & continue'}
        </AdminButton>
      </form>
    </div>
  );
}
