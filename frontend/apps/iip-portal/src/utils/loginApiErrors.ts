import { extractApiDetail, type IipApiErrorPayload } from './apiMessages';

const CREDENTIALS_FALLBACK = 'Invalid username or password.';
const GENERIC_FALLBACK = 'Authentication failed. Please check your credentials.';

function isMfaCodeError(field?: string): boolean {
  return field === 'code';
}

function isCaptchaError(detail: string, errorCode?: string, field?: string): boolean {
  if (field === 'captcha_code') return true;
  if (errorCode === 'VALIDATION_ERROR') {
    const lower = detail.toLowerCase();
    return (
      lower.includes('captcha') ||
      lower.includes('security code') ||
      lower.includes('wrong security')
    );
  }
  return false;
}

function mapCaptchaMessage(detail: string): string {
  const lower = detail.toLowerCase();
  if (lower.includes('expired') || lower.includes('refresh') || lower.includes('invalid')) {
    return 'Security code expired. Please refresh and try again.';
  }
  return 'Wrong security code.';
}

export function getLoginErrorMessage(err: unknown): string {
  if (!err || typeof err !== 'object' || !('response' in err)) {
    return GENERIC_FALLBACK;
  }

  const response = err.response as { status?: number; data?: unknown };
  if (!response || typeof response !== 'object') {
    return GENERIC_FALLBACK;
  }

  const status = response.status;
  const data = response.data;

  if (status && status >= 500) {
    return 'Server error during sign-in. Please try again or contact support.';
  }

  if (!data || typeof data !== 'object') {
    return status === 401 ? CREDENTIALS_FALLBACK : GENERIC_FALLBACK;
  }

  const { detail, errorCode, field } = extractApiDetail(data as IipApiErrorPayload);

  if (!detail) {
    return status === 401 ? CREDENTIALS_FALLBACK : GENERIC_FALLBACK;
  }

  if (isMfaCodeError(field)) {
    return detail || 'Invalid authentication code. Try again.';
  }

  if (isCaptchaError(detail, errorCode, field)) {
    return mapCaptchaMessage(detail);
  }

  if (errorCode === 'UNAUTHORIZED') {
    return detail || CREDENTIALS_FALLBACK;
  }

  return detail;
}
