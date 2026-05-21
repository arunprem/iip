export type LoginField = 'username' | 'password' | 'captchaCode';

export type LoginFieldErrors = Partial<Record<LoginField, string>>;

export interface LoginFormValues {
  username: string;
  password: string;
  captchaCode: string;
}

const USERNAME_MIN = 3;
const PASSWORD_MIN = 5;
const CAPTCHA_MIN = 4;
const CAPTCHA_MAX = 8;

export function validateLoginField(
  field: LoginField,
  values: LoginFormValues
): string | undefined {
  switch (field) {
    case 'username': {
      const value = values.username.trim();
      if (!value) return 'Please enter your username.';
      if (value.length < USERNAME_MIN) {
        return `Username must be at least ${USERNAME_MIN} characters.`;
      }
      return undefined;
    }
    case 'password': {
      if (!values.password) return 'Please enter your password.';
      if (values.password.length < PASSWORD_MIN) {
        return `Password must be at least ${PASSWORD_MIN} characters.`;
      }
      return undefined;
    }
    case 'captchaCode': {
      const value = values.captchaCode.trim();
      if (!value) return 'Please enter the security code.';
      if (value.length < CAPTCHA_MIN || value.length > CAPTCHA_MAX) {
        return `Security code must be ${CAPTCHA_MIN}–${CAPTCHA_MAX} characters.`;
      }
      if (!/^[a-zA-Z0-9]+$/.test(value)) {
        return 'Security code can only contain letters and numbers.';
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

export function validateLoginForm(values: LoginFormValues): LoginFieldErrors {
  const fields: LoginField[] = ['username', 'password', 'captchaCode'];
  const errors: LoginFieldErrors = {};

  for (const field of fields) {
    const message = validateLoginField(field, values);
    if (message) errors[field] = message;
  }

  return errors;
}

export function hasLoginErrors(errors: LoginFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
