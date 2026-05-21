import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { apiClient } from '../api/client';
import { useThemeStore } from '../stores/themeStore';
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
import {
  ShieldAlert,
  Lock,
  User,
  Sun,
  Moon,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';

function GridPattern() {
  return (
    <svg
      className="absolute inset-0 h-full w-full opacity-[0.07]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="login-grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path
            d="M 32 0 L 0 0 0 32"
            fill="none"
            stroke="white"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#login-grid)" />
    </svg>
  );
}

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

  const login = useAuthStore((state) => state.login);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken && state.user));
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  const formValues: LoginFormValues = { username, password, captchaCode };

  const fetchCaptcha = async (options?: { clearError?: boolean }) => {
    setCaptchaLoading(true);
    setCaptchaImage('');
    try {
      const { data } = await apiClient.get<{ captcha_id: string; image_base64: string }>(
        '/captcha',
        { skipToast: true }
      );
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
      await login(username.trim(), password, captchaId, captchaCode.trim());
    } catch (err: unknown) {
      setError(getLoginErrorMessage(err));
      await fetchCaptcha();
    }
  };

  return (
    <div className="min-h-screen flex w-full bg-iip-bg">
      {/* Left — hero / branding */}
      <div className="relative hidden md:flex md:w-[58%] lg:w-[60%] overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
        <GridPattern />

        <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between h-full p-10 lg:p-14">
          <div className="flex items-center gap-3">
            <IipLogo size="md" whiteBackground />
            <div>
              <p className="text-white font-bold text-lg tracking-tight">IIP</p>
              <p className="text-blue-200/80 text-xs font-medium tracking-wide">
                Kerala Police
              </p>
            </div>
          </div>

          <p className="max-w-md text-slate-300/90 text-sm lg:text-base leading-relaxed">
            Secure access for authorized Kerala Police personnel. All sessions are
            monitored and audited.
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

        <div className="w-full max-w-[380px] mx-auto">
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
                <div className="h-[52px] w-[200px] rounded-lg border border-iip-border bg-iip-surface overflow-hidden shadow-inner flex items-center justify-center shrink-0">
                  {captchaLoading ? (
                    <div className="h-5 w-5 border-2 border-iip-primary/30 border-t-iip-primary rounded-full animate-spin" />
                  ) : captchaImage ? (
                    <img
                      src={captchaImage}
                      alt="Security verification code"
                      className="h-full w-full object-cover object-center select-none"
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
                  onChange={(e) => {
                    setCaptchaCode(e.target.value);
                    clearFieldError('captchaCode');
                  }}
                  onBlur={() => handleBlur('captchaCode')}
                  disabled={isLoading || captchaLoading}
                  className={inputClass('captchaCode', 'px-3.5 py-3 tracking-widest')}
                  placeholder="Enter Security Code"
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

          <p className="mt-12 text-center text-[11px] text-iip-text-muted leading-relaxed">
            Developed and Maintained by Kerala Police, CCTNS Division
          </p>
        </div>
      </div>
    </div>
  );
}
