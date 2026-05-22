import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { AdminButton } from '../admin/AdminButton';
import { TotpCodeInput } from './TotpCodeInput';

interface MfaVerifyStepProps {
  title?: string;
  subtitle?: string;
  error?: string | null;
  isLoading?: boolean;
  onVerify: (code: string) => void | Promise<void>;
  onBack?: () => void;
}

export function MfaVerifyStep({
  title = 'Two-factor authentication',
  subtitle = 'Enter the 6-digit code from your authenticator app.',
  error,
  isLoading = false,
  onVerify,
  onBack,
}: MfaVerifyStepProps) {
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (code.length !== 6) return;
    void onVerify(code);
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex flex-col items-center text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-iip-primary/10 text-iip-primary mb-4">
          <ShieldCheck size={28} aria-hidden />
        </div>
        <h2 className="text-xl font-bold text-iip-text">{title}</h2>
        <p className="text-sm text-iip-text-muted mt-2 max-w-sm">{subtitle}</p>
      </div>

      {error && (
        <div className="alert-danger mb-6" role="alert">
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <TotpCodeInput
          value={code}
          onChange={(v) => {
            setCode(v);
            setTouched(false);
          }}
          disabled={isLoading}
          autoFocus
          invalid={touched && code.length !== 6}
        />
        {touched && code.length !== 6 && (
          <p className="text-center text-xs font-medium text-red-600">Enter all 6 digits.</p>
        )}

        <AdminButton
          type="submit"
          variant="primary"
          className="w-full justify-center"
          disabled={isLoading || code.length !== 6}
        >
          {isLoading ? 'Verifying…' : 'Continue'}
        </AdminButton>

        {onBack && (
          <AdminButton
            type="button"
            variant="ghost"
            className="w-full justify-center"
            disabled={isLoading}
            onClick={onBack}
          >
            Back to sign in
          </AdminButton>
        )}
      </form>
    </div>
  );
}
