import type { AuthUser } from '@/features/auth/hooks/use-auth-store';

interface LoginPayload {
  companyCode: string;
  phoneNumber: string;
}

interface EmailCodePayload {
  email: string;
}

interface VerifyEmailCodePayload {
  email: string;
  code: string;
}

interface LoginErrorResponse {
  error: string;
}

export type LoginSuccessData = Omit<AuthUser, 'companyCode' | 'phoneNumber'> & {
  emailVerificationEnabled: boolean;
};

type LoginResult =
  | { success: true; data: LoginSuccessData }
  | { success: false; error: string };

export async function fetchLogin(payload: LoginPayload): Promise<LoginResult> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData: LoginErrorResponse = await res.json().catch(() => ({
      error: '로그인 중 오류가 발생했습니다.',
    }));
    return { success: false, error: errorData.error };
  }

  const data = await res.json();
  return { success: true, data };
}

type EmailCodeResult = { success: true } | { success: false; error: string };

export async function requestEmailCode(payload: EmailCodePayload): Promise<EmailCodeResult> {
  const res = await fetch('/api/auth/request-email-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData: LoginErrorResponse = await res.json().catch(() => ({
      error: '인증번호 전송에 실패했습니다.',
    }));
    return { success: false, error: errorData.error };
  }

  return { success: true };
}

export async function verifyEmailCode(payload: VerifyEmailCodePayload): Promise<EmailCodeResult> {
  const res = await fetch('/api/auth/verify-email-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData: LoginErrorResponse = await res.json().catch(() => ({
      error: '인증번호 확인에 실패했습니다.',
    }));
    return { success: false, error: errorData.error };
  }

  return { success: true };
}
