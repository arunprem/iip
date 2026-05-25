/// Client-side login validation (aligned with web `loginValidation.ts`).
const int loginPenMinLength = 3;
const int loginPasswordMinLength = 5;
const int loginCaptchaMinLength = 4;
const int loginCaptchaMaxLength = 8;

String? validateLoginPen(String? value) {
  final trimmed = (value ?? '').trim();
  if (trimmed.isEmpty) return 'Please enter your PEN number.';
  if (trimmed.length < loginPenMinLength) {
    return 'PEN number must be at least $loginPenMinLength characters.';
  }
  return null;
}

String? validateLoginPassword(String? value) {
  final text = value ?? '';
  if (text.isEmpty) return 'Please enter your password.';
  if (text.length < loginPasswordMinLength) {
    return 'Password must be at least $loginPasswordMinLength characters.';
  }
  return null;
}

String? validateLoginCaptcha(String? value) {
  final trimmed = (value ?? '').trim();
  if (trimmed.isEmpty) return 'Please enter the security code.';
  if (trimmed.length < loginCaptchaMinLength || trimmed.length > loginCaptchaMaxLength) {
    return 'Security code must be $loginCaptchaMinLength–$loginCaptchaMaxLength characters.';
  }
  if (!RegExp(r'^[a-zA-Z0-9]+$').hasMatch(trimmed)) {
    return 'Security code can only contain letters and numbers.';
  }
  return null;
}
