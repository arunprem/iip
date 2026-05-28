import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import {
  completeEnrollment,
  fetchEnrollmentSetup,
  verifyMfaCode,
  type MfaSetupPayload,
} from '../api/mfa';
import { fetchCaptchaImage } from '../api/captcha';
import { MfaEnrollmentStep } from '../components/mfa/MfaEnrollmentStep';
import { MfaVerifyStep } from '../components/mfa/MfaVerifyStep';
import { useThemeStore } from '../stores/themeStore';
import { sanitizeCaptchaInput } from '../utils/captchaInput';
import { getLoginErrorMessage } from '../utils/loginApiErrors';
import {
  validateLoginField,
  validateLoginForm,
  hasLoginErrors,
  type LoginField,
  type LoginFieldErrors,
  type LoginFormValues,
} from '../utils/loginValidation';
import { IipLogo } from '../components/IipLogo';
import { ClusterNetworkBackground } from '../components/auth/ClusterNetworkBackground';
import {
  ShieldAlert,
  Lock,
  User,
  Sun,
  Moon,
  RefreshCw,
  ArrowRight,
  Network,
} from 'lucide-react';

function FieldFeedback({
  show,
  message,
}: {
  show: boolean;
  message?: string;
}) {
  if (!show || !message) return null;
  return <div className="invalid-feedback">{message}</div>;
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captchaCode, setCaptchaCode] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaImage, setCaptchaImage] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [validated, setValidated] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const [loginStep, setLoginStep] = useState<'credentials' | 'mfa_verify' | 'mfa_enroll'>('credentials');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [enrollSetup, setEnrollSetup] = useState<MfaSetupPayload | null>(null);
  const [mfaLoading, setMfaLoading] = useState(false);

  const login = useAuthStore((state) => state.login);
  const finishAuthTokens = useAuthStore((state) => state.finishAuthTokens);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken && state.user));
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  const formValues: LoginFormValues = { username, password, captchaCode };

  const fetchCaptcha = async (options?: { clearError?: boolean }) => {
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
    } catch (err) {
      console.error('Failed to fetch captcha:', err);
      setError('Unable to load security code. Please refresh and try again.');
    } finally {
      setCaptchaLoading(false);
    }
  };

  useEffect(() => {
    fetchCaptcha();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      const from = location.state?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  const clearFieldError = useCallback((field: LoginField) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const validateField = useCallback(
    (field: LoginField) => {
      const message = validateLoginField(field, formValues);
      setFieldErrors((prev) => {
        const next = { ...prev };
        if (message) next[field] = message;
        else delete next[field];
        return next;
      });
      return message;
    },
    [formValues]
  );

  const handleBlur = (field: LoginField) => {
    if (validated) validateField(field);
  };

  const inputClass = (field: LoginField, extra = '') => {
    const invalid = validated && fieldErrors[field];
    return `form-control ${invalid ? 'is-invalid' : ''} ${extra}`.trim();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidated(true);
    setError(null);

    const errors = validateLoginForm(formValues);
    setFieldErrors(errors);
    if (hasLoginErrors(errors)) return;

    try {
      const result = await login(username.trim(), password, captchaId, sanitizeCaptchaInput(captchaCode));
      if (result.status === 'mfa_verify') {
        setMfaToken(result.mfaToken);
        setLoginStep('mfa_verify');
        setError(null);
        return;
      }
      if (result.status === 'mfa_enroll') {
        setMfaToken(result.mfaToken);
        setLoginStep('mfa_enroll');
        setMfaLoading(true);
        try {
          const res = await fetchEnrollmentSetup(result.mfaToken);
          setEnrollSetup(res.data);
          setError(null);
        } catch (err: unknown) {
          setError(getLoginErrorMessage(err));
          setLoginStep('credentials');
        } finally {
          setMfaLoading(false);
        }
        return;
      }
    } catch (err: unknown) {
      setError(getLoginErrorMessage(err));
      await fetchCaptcha({ clearError: false });
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

  const backToCredentials = () => {
    setLoginStep('credentials');
    setMfaToken(null);
    setEnrollSetup(null);
    setError(null);
    void fetchCaptcha({ clearError: true });
  };

  return (
    <div className="min-h-screen flex w-full bg-iip-bg">
      {/* Left — hero with clustered network graph (matches mobile auth) */}
      <div className="relative hidden md:flex md:w-[58%] lg:w-[60%] overflow-hidden bg-gradient-to-br from-[#030712] via-slate-950 to-blue-950">
        <ClusterNetworkBackground />

        <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-400/12 rounded-full blur-3xl pointer-events-none" />
        <div
          className="absolute inset-0 pointer-events-none bg-gradient-to-b from-slate-950/20 via-transparent to-slate-950/50"
          aria-hidden
        />

        <div className="relative z-10 flex flex-col justify-between h-full p-10 lg:p-14">
          <div className="flex items-center gap-3">
            <IipLogo size="md" whiteBackground className="drop-shadow-lg" />
            <div>
              <p className="text-white font-bold text-lg tracking-tight">IIP</p>
              <p className="text-blue-200/80 text-xs font-medium tracking-wide">
                Kerala Police · CCTNS Division
              </p>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center py-8 pointer-events-none">
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm px-6 py-5 text-center max-w-sm shadow-xl shadow-blue-950/40">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/20 text-sky-300">
                <Network size={26} strokeWidth={1.75} />
              </div>
              <p className="text-white/95 font-semibold text-base tracking-tight">
                Intelligence-led policing
              </p>
              <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                Connected units, shared context, and secure access across the platform.
              </p>
            </div>
          </div>

          <p className="max-w-md text-slate-400/90 text-sm leading-relaxed">
            Secure sign-in for authorized personnel. All sessions are monitored and audited.
          </p>
        </div>
      </div>

      {/* Right — login form (theme-aware) */}
      <div className="relative w-full md:w-[42%] lg:w-[40%] flex flex-col justify-center bg-iip-surface px-8 sm:px-12 lg:px-16 py-12 transition-colors duration-300">
        <div className="absolute top-6 right-6">
          <button
            type="button"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            className="p-2.5 text-iip-text-muted hover:text-iip-primary hover:bg-iip-primary/10 rounded-full transition-colors border border-iip-border bg-iip-bg"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        <div className="w-full max-w-[420px] mx-auto">
          {loginStep === 'credentials' ? (
            <>
          <div className="flex flex-col items-center text-center mb-10">
            <IipLogo size="lg" whiteBackground className="mb-5" />
            <h1 className="text-xl font-bold text-iip-text tracking-tight">IIP</h1>
            <h2 className="text-2xl font-extrabold text-iip-text mt-3">Sign In</h2>
            <p className="text-sm text-iip-text-muted mt-1.5">
              Enter your credentials to continue
            </p>
          </div>

          {error && (
            <div className="alert-danger mb-6" role="alert">
              <ShieldAlert size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className={`space-y-5 ${validated ? 'was-validated' : ''}`}
            noValidate
          >
            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <User size={17} className="text-iip-text-muted" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    clearFieldError('username');
                  }}
                  onBlur={() => handleBlur('username')}
                  disabled={isLoading}
                  autoFocus
                  className={inputClass('username', 'pl-10 pr-4 py-3.5')}
                  placeholder="Username"
                  aria-invalid={validated && !!fieldErrors.username}
                  aria-describedby={fieldErrors.username ? 'username-error' : undefined}
                />
              </div>
              <FieldFeedback
                show={validated}
                message={fieldErrors.username}
              />
              {validated && fieldErrors.username && (
                <span id="username-error" className="sr-only">
                  {fieldErrors.username}
                </span>
              )}
            </div>

            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock size={17} className="text-iip-text-muted" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearFieldError('password');
                  }}
                  onBlur={() => handleBlur('password')}
                  disabled={isLoading}
                  className={inputClass('password', 'pl-10 pr-4 py-3.5')}
                  placeholder="Password"
                  aria-invalid={validated && !!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                />
              </div>
              <FieldFeedback
                show={validated}
                message={fieldErrors.password}
              />
            </div>

            {/* Security check */}
            <div className="rounded-xl border border-iip-border bg-iip-bg/80 p-4 shadow-sm">
              <p className="text-[10px] font-bold text-iip-text-muted uppercase tracking-[0.18em] mb-3">
                Security Check
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
                  onClick={() => fetchCaptcha()}
                  disabled={captchaLoading}
                  className="p-2.5 text-iip-primary hover:bg-iip-primary/10 rounded-lg transition-colors disabled:opacity-40 border border-transparent hover:border-iip-border"
                  title="Refresh security code"
                >
                  <RefreshCw
                    size={20}
                    className={captchaLoading ? 'animate-spin' : ''}
                  />
                </button>
              </div>

              <div>
                <input
                  id="captchaCode"
                  name="captchaCode"
                  type="text"
                  value={captchaCode}
                  maxLength={8}
                  inputMode="text"
                  autoCapitalize="off"
                  autoCorrect="off"
                  onChange={(e) => {
                    setCaptchaCode(sanitizeCaptchaInput(e.target.value));
                    clearFieldError('captchaCode');
                  }}
                  onBlur={() => handleBlur('captchaCode')}
                  disabled={isLoading || captchaLoading || !captchaId}
                  className={inputClass('captchaCode', 'px-3.5 py-3 tracking-widest font-mono text-center')}
                  placeholder="Enter security code"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={validated && !!fieldErrors.captchaCode}
                />
                <FieldFeedback
                  show={validated}
                  message={fieldErrors.captchaCode}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || captchaLoading || !captchaId}
              className="w-full mt-2 bg-iip-primary hover:bg-iip-primary-hover text-white font-semibold text-sm py-3.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md shadow-iip-primary/20"
            >
              {isLoading ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
            </>
          ) : loginStep === 'mfa_verify' ? (
            <MfaVerifyStep
              error={error}
              isLoading={mfaLoading || isLoading}
              onVerify={handleMfaVerify}
              onBack={backToCredentials}
            />
          ) : enrollSetup ? (
            <MfaEnrollmentStep
              setup={enrollSetup}
              error={error}
              isLoading={mfaLoading}
              onComplete={handleMfaEnrollComplete}
            />
          ) : (
            <div className="text-center py-12 text-sm text-iip-text-muted">
              <div className="h-8 w-8 border-2 border-iip-primary/30 border-t-iip-primary rounded-full animate-spin mx-auto mb-3" />
              Preparing authenticator setup…
            </div>
          )}

          <p className="mt-12 text-center text-[11px] text-iip-text-muted leading-relaxed">
            Developed and Maintained by Kerala Police, CCTNS Division
          </p>
        </div>
      </div>
    </div>
  );
}
