/** Captcha codes are 4–8 alphanumeric characters (case-insensitive on the server). */
export const CAPTCHA_MAX_LENGTH = 8;

export function sanitizeCaptchaInput(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').slice(0, CAPTCHA_MAX_LENGTH);
}
