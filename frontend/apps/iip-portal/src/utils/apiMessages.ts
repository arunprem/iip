/** Parse IIP API success/error payloads for toast messages. */

export interface IipApiErrorPayload {
  error?: {
    error_code?: string;
    detail?: string;
    field?: string | null;
    meta?: { field?: string } | null;
  };
  detail?: string | Array<{ msg?: string; loc?: unknown[] }>;
  message?: string;
}

export function extractApiDetail(data: unknown): {
  detail?: string;
  errorCode?: string;
  field?: string;
} {
  if (!data || typeof data !== 'object') return {};

  const payload = data as IipApiErrorPayload;

  if (payload.error?.detail) {
    return {
      detail: payload.error.detail,
      errorCode: payload.error.error_code,
      field: payload.error.field ?? payload.error.meta?.field ?? undefined,
    };
  }

  if (typeof payload.message === 'string' && payload.message.trim()) {
    return { detail: payload.message };
  }

  if (typeof payload.detail === 'string') {
    return { detail: payload.detail };
  }

  if (Array.isArray(payload.detail)) {
    const message = payload.detail
      .map((item) => (typeof item === 'object' && item?.msg ? String(item.msg) : null))
      .filter(Boolean)
      .join(' ');
    return message ? { detail: message } : {};
  }

  return {};
}

/** Generic message for authorization failures — never expose roles or privileges. */
export const GENERIC_FORBIDDEN_MESSAGE =
  'You do not have permission to perform this action.';

const FORBIDDEN_DISCLOSURE =
  /SYSTEM_ADMIN|IT_ADMIN|WATCH_OFFICER|SUPERVISOR|ANALYST|role is required|required role|One of roles|Role '[\w-]+' is required|Clearance level|administrator role|privilege.*required/i;

/** Strip role/privilege hints from 403 responses (defense in depth). */
export function sanitizeForbiddenDetail(
  detail: string | undefined,
  status?: number
): string | undefined {
  if (status !== 403 || !detail?.trim()) return detail;
  if (FORBIDDEN_DISCLOSURE.test(detail)) return GENERIC_FORBIDDEN_MESSAGE;
  return detail;
}

export function extractApiErrorMessage(data: unknown, status?: number): string {
  const { detail } = extractApiDetail(data);
  const safeDetail = sanitizeForbiddenDetail(detail, status);

  if (safeDetail) return safeDetail;

  if (status === 401) return 'Session expired or invalid credentials.';
  if (status === 403) return GENERIC_FORBIDDEN_MESSAGE;
  if (status === 404) return 'The requested resource was not found.';
  if (status === 409) return 'This operation conflicts with existing data.';
  if (status && status >= 500) return 'Server error. Please try again later.';

  return 'Something went wrong. Please try again.';
}

export function extractApiSuccessMessage(
  data: unknown,
  method: string,
  status: number
): string | null {
  const { detail } = extractApiDetail(data);
  if (detail) return detail;

  const m = method.toUpperCase();
  if (status === 204) return 'Completed successfully.';
  if (m === 'POST' && status === 201) return 'Created successfully.';
  if ((m === 'PUT' || m === 'PATCH') && status >= 200 && status < 300) {
    return 'Saved successfully.';
  }
  if (m === 'DELETE' && status >= 200 && status < 300) return 'Deleted successfully.';

  return null;
}

export function statusToToastType(status: number): 'success' | 'error' | 'warning' | 'info' {
  if (status >= 500) return 'error';
  if (status === 401 || status === 403) return 'error';
  if (status === 404 || status === 409) return 'warning';
  if (status >= 400) return 'warning';
  return 'error';
}
