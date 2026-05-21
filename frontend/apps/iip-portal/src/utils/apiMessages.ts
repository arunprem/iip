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

export function extractApiErrorMessage(data: unknown, status?: number): string {
  const { detail } = extractApiDetail(data);

  if (detail) return detail;

  if (status === 401) return 'Session expired or invalid credentials.';
  if (status === 403) return 'You do not have permission to perform this action.';
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
