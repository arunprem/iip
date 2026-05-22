import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Lock,
  LogOut,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import {
  completeEnrollment,
  fetchEnrollmentSetup,
  verifyMfaCode,
  type MfaSetupPayload,
} from '../api/mfa';
import { fetchCaptchaImage } from '../api/captcha';
import { MfaEnrollmentStep } from './mfa/MfaEnrollmentStep';
import { MfaVerifyStep } from './mfa/MfaVerifyStep';
import { IipLogo } from './IipLogo';
import { ProfileAvatar } from './ProfileAvatar';
import { useAuthStore } from '../stores/authStore';
import { getLoginErrorMessage } from '../utils/loginApiErrors';
import { sanitizeCaptchaInput } from '../utils/captchaInput';
import {
  validateLoginField,
  type LoginFieldErrors,
} from '../utils/loginValidation';

function FieldFeedback({ show, message }: { show: boolean; message?: string }) {
  if (!show || !message) return null;
  return <div className="invalid-feedback">{message}</div>;
}

export function SessionLockScreen() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const profilePhotoRevision = useAuthStore((s) => s.profilePhotoRevision);
  const lockReason = useAuthStore((s) => s.lockReason);
  const unlockSession = useAuthStore((s) => s.unlockSession);
  const finishAuthTokens = useAuthStore((s) => s.finishAuthTokens);
  const switchAccount = useAuthStore((s) => s.switchAccount);
  const isLoading = useAuthStore((s) => s.isLoading);

  const [unlockStep, setUnlockStep] = useState<'credentials' | 'mfa_verify' | 'mfa_enroll'>('credentials');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [enrollSetup, setEnrollSetup] = useState<MfaSetupPayload | null>(null);
  const [mfaLoading, setMfaLoading] = useState(false);

  const [password, setPassword] = useState('');
  const [captchaCode, setCaptchaCode] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaImage, setCaptchaImage] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [validated, setValidated] = useState(false);

  const fetchCaptcha = useCallback(async (options?: { clearError?: boolean }) => {
    setCaptchaLoading(true);
    setCaptchaImage('');
    try {
      const data = await fetchCaptchaImage();
      setCaptchaId(data.captcha_id);
      setCaptchaImage(data.image_base64);
      setCaptchaCode('');
      if (options?.clearError) {
        setError(null);
      }
    } catch {
      setError('Unable to load security code. Please try again.');
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCaptcha();
  }, [fetchCaptcha]);

  if (!user) return null;

  const reasonText =
    lockReason === 'idle'
      ? 'Your session was locked due to inactivity.'
      : 'Your session has expired. Sign in again to continue.';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidated(true);
    setError(null);

    const errors: LoginFieldErrors = {};
    const passwordErr = validateLoginField('password', { username: '', password, captchaCode });
    const captchaErr = validateLoginField('captchaCode', { username: '', password, captchaCode });
    if (passwordErr) errors.password = passwordErr;
    if (captchaErr) errors.captchaCode = captchaErr;
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    try {
      const result = await unlockSession(password, captchaId, sanitizeCaptchaInput(captchaCode));
      setPassword('');
      setCaptchaCode('');
      if (result.status === 'mfa_verify') {
        setMfaToken(result.mfaToken);
        setUnlockStep('mfa_verify');
        setError(null);
        return;
      }
      if (result.status === 'mfa_enroll') {
        setMfaToken(result.mfaToken);
        setUnlockStep('mfa_enroll');
        setMfaLoading(true);
        try {
          const res = await fetchEnrollmentSetup(result.mfaToken);
          setEnrollSetup(res.data);
          setError(null);
        } catch (err: unknown) {
          setError(getLoginErrorMessage(err));
          setUnlockStep('credentials');
        } finally {
          setMfaLoading(false);
        }
      }
    } catch (err: unknown) {
      setError(getLoginErrorMessage(err));
      await fetchCaptcha();
    }
  };

  const handleMfaVerify = async (code: string) => {
    if (!mfaToken) return;
    setMfaLoading(true);
    setError(null);
    try {
      const res = await verifyMfaCode(mfaToken, code);
      const data = res.data;
      if (!data.access_token || !data.refresh_token) throw new Error('Invalid MFA response.');
      await finishAuthTokens(data.access_token, data.refresh_token);
    } catch (err: unknown) {
      setError(getLoginErrorMessage(err));
    } finally {
      setMfaLoading(false);
    }
  };

  const handleMfaEnrollComplete = async (code: string) => {
    if (!mfaToken) return;
    setMfaLoading(true);
    setError(null);
    try {
      const res = await completeEnrollment(mfaToken, code);
      const data = res.data;
      if (!data.access_token || !data.refresh_token) throw new Error('Invalid MFA response.');
      await finishAuthTokens(data.access_token, data.refresh_token);
    } catch (err: unknown) {
      setError(getLoginErrorMessage(err));
    } finally {
      setMfaLoading(false);
    }
  };

  const handleSwitchAccount = () => {
    switchAccount();
    navigate('/login', { replace: true });
  };

  const inputClass = (field: 'password' | 'captchaCode', extra = '') => {
    const invalid = validated && fieldErrors[field];
    return `form-control ${invalid ? 'is-invalid' : ''} ${extra}`.trim();
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-lock-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-iip-border bg-iip-surface shadow-2xl overflow-hidden">
        <div className="px-6 pt-8 pb-4 text-center border-b border-iip-border bg-gradient-to-b from-iip-primary/[0.06] to-transparent">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-iip-primary/10 text-iip-primary mb-4">
            <Lock size={28} aria-hidden />
          </div>
          <IipLogo size="sm" whiteBackground className="mx-auto mb-3" />
          <h2 id="session-lock-title" className="text-xl font-bold text-iip-text">
            Session locked
          </h2>
          <p className="text-sm text-iip-text-muted mt-2">{reasonText}</p>
        </div>

        <div className="px-6 py-6">
          <div className="flex items-center gap-3 mb-6 p-3 rounded-xl bg-iip-bg border border-iip-border">
            <ProfileAvatar
              name={user.full_name || user.username}
              hasPhoto={Boolean(user.profile_photo_url)}
              photoRevision={profilePhotoRevision}
              className="h-10 w-10"
            />
            <div className="min-w-0 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-iip-text-muted">
                Signed in as
              </p>
              <p className="text-sm font-semibold text-iip-text truncate">
                {user.full_name || user.username}
              </p>
              {user.full_name && (
                <p className="text-xs text-iip-text-muted truncate">@{user.username}</p>
              )}
            </div>
          </div>

          {unlockStep === 'credentials' ? (
            <>
          {error && (
            <div className="alert-danger mb-5" role="alert">
              <ShieldAlert size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="unlock-password" className="admin-form-label block mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock
                  size={17}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-iip-text-muted pointer-events-none"
                  aria-hidden
                />
                <input
                  id="unlock-password"
                  type="password"
                  autoFocus
                  value={password}
                  disabled={isLoading}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.password;
                      return next;
                    });
                  }}
                  className={inputClass('password', 'pl-10 py-3')}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
              </div>
              <FieldFeedback show={validated} message={fieldErrors.password} />
            </div>

            <div className="rounded-xl border border-iip-border bg-iip-bg/80 p-4">
              <p className="text-[10px] font-bold text-iip-text-muted uppercase tracking-[0.18em] mb-3">
                Security check
              </p>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-[52px] w-[200px] rounded-lg bg-white overflow-hidden flex items-center justify-center shrink-0">
                  {captchaLoading ? (
                    <div className="h-5 w-5 border-2 border-iip-primary/30 border-t-iip-primary rounded-full animate-spin" />
                  ) : captchaImage ? (
                    <img
                      src={captchaImage}
                      alt="Security verification code"
                      className="max-h-full max-w-full object-contain select-none"
                      draggable={false}
                    />
                  ) : (
                    <span className="text-xs text-iip-text-muted">Unavailable</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void fetchCaptcha({ clearError: true })}
                  disabled={captchaLoading}
                  className="p-2.5 text-iip-primary hover:bg-iip-primary/10 rounded-lg transition-colors disabled:opacity-40"
                  title="Refresh security code"
                >
                  <RefreshCw size={20} className={captchaLoading ? 'animate-spin' : ''} />
                </button>
              </div>
              <input
                id="unlock-captcha"
                type="text"
                value={captchaCode}
                disabled={isLoading || !captchaId}
                maxLength={8}
                inputMode="text"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => {
                  setCaptchaCode(sanitizeCaptchaInput(e.target.value));
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.captchaCode;
                    return next;
                  });
                }}
                className={inputClass('captchaCode', 'py-3 tracking-widest font-mono text-center')}
                placeholder="Enter code (letters or numbers)"
                autoComplete="off"
                aria-describedby="unlock-captcha-hint"
              />
              <p id="unlock-captcha-hint" className="mt-1.5 text-[11px] text-iip-text-muted text-center">
                Not case-sensitive — enter the characters shown in the image.
              </p>
              <FieldFeedback show={validated} message={fieldErrors.captchaCode} />
            </div>

            <button
              type="submit"
              disabled={isLoading || captchaLoading || !captchaId}
              className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-iip-primary text-white font-semibold hover:bg-iip-primary-hover disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Unlocking…' : 'Unlock session'}
              <ArrowRight size={18} aria-hidden />
            </button>
          </form>
            </>
          ) : unlockStep === 'mfa_verify' ? (
            <MfaVerifyStep
              title="Verify authenticator"
              subtitle="Enter the code from your authenticator app to unlock."
              error={error}
              isLoading={mfaLoading || isLoading}
              onVerify={handleMfaVerify}
            />
          ) : enrollSetup ? (
            <MfaEnrollmentStep
              setup={enrollSetup}
              error={error}
              isLoading={mfaLoading}
              onComplete={handleMfaEnrollComplete}
            />
          ) : (
            <p className="text-sm text-iip-text-muted text-center py-8">Loading setup…</p>
          )}

          {unlockStep === 'credentials' && (
          <button
            type="button"
            onClick={handleSwitchAccount}
            disabled={isLoading}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-iip-text-muted hover:text-iip-text transition-colors disabled:opacity-50"
          >
            <LogOut size={16} aria-hidden />
            Sign in with another account
          </button>
          )}
        </div>
      </div>
    </div>
  );
}
