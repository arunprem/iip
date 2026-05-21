import { apiClient } from './http';

export interface CaptchaPayload {
  captcha_id: string;
  image_base64: string;
}

/** Fetch a new captcha image (no auth header; short timeout). */
export async function fetchCaptchaImage(timeoutMs = 10_000): Promise<CaptchaPayload> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await apiClient.get<CaptchaPayload>('/captcha/', {
      skipToast: true,
      signal: controller.signal,
    });
    return res.data;
  } finally {
    window.clearTimeout(timer);
  }
}
