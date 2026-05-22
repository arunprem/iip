import { apiClient } from './client';

export interface AuthResult {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  mfa_required: boolean;
  mfa_token?: string;
  enrollment_required: boolean;
}

export interface MfaStatus {
  mfa_enabled: boolean;
  mfa_enrolled: boolean;
  force_mfa: boolean;
  can_disable: boolean;
}

export interface MfaSetupPayload {
  otpauth_uri: string;
  qr_code_data_url: string;
  manual_entry_key: string;
  setup_token?: string;
}

export function isMfaChallenge(data: AuthResult): boolean {
  return Boolean(data.mfa_required && data.mfa_token);
}

export async function verifyMfaCode(mfaToken: string, code: string) {
  return apiClient.post<AuthResult>(
    '/auth/mfa/verify',
    { mfa_token: mfaToken, code },
    { skipToast: true }
  );
}

export async function fetchEnrollmentSetup(mfaToken: string) {
  return apiClient.post<MfaSetupPayload>(
    '/auth/mfa/enrollment/setup',
    { mfa_token: mfaToken },
    { skipToast: true }
  );
}

export async function completeEnrollment(mfaToken: string, code: string) {
  return apiClient.post<AuthResult>(
    '/auth/mfa/enrollment/complete',
    { mfa_token: mfaToken, code },
    { skipToast: true }
  );
}

export async function fetchMfaStatus() {
  return apiClient.get<MfaStatus>('/auth/me/mfa/status', { skipToast: true });
}

export async function startMfaSetup() {
  return apiClient.post<MfaSetupPayload>('/auth/me/mfa/setup', {}, { skipToast: true });
}

export async function enableMfa(setupToken: string, code: string) {
  return apiClient.post('/auth/me/mfa/enable', { setup_token: setupToken, code }, { skipToast: true });
}

export async function disableMfa(code: string) {
  return apiClient.post('/auth/me/mfa/disable', { code }, { skipToast: true });
}

export async function fetchMfaPolicy() {
  return apiClient.get<{ force_mfa: boolean }>('/iam/security/mfa-policy', { skipToast: true });
}

export async function updateMfaPolicy(forceMfa: boolean) {
  return apiClient.patch<{ force_mfa: boolean }>(
    '/iam/security/mfa-policy',
    { force_mfa: forceMfa },
    { skipToast: true }
  );
}
