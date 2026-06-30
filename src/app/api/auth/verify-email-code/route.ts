import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { validateEmailCode } from '@/app/api/auth/_lib/email-code-store';
import { isAuthEmailVerificationEnabled } from '@/app/api/auth/_lib/email-verification-enabled';

const verifyEmailCodeSchema = z.object({
  email: z.string().email('유효한 이메일 형식이 아닙니다.'),
  code: z.string().regex(/^[0-9]{6}$/, '6자리 숫자 인증번호를 입력해주세요.'),
});

export async function POST(request: NextRequest) {
  if (!isAuthEmailVerificationEnabled()) {
    return NextResponse.json(
      { error: '이메일 인증이 비활성화되어 있습니다.' },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = verifyEmailCodeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { email, code } = parsed.data;
  const result = validateEmailCode(email, code);

  if (!result.success) {
    if (result.reason === 'expired') {
      return NextResponse.json(
        { error: '인증번호가 만료되었거나 발급되지 않았습니다.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: '인증번호가 일치하지 않습니다.' }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
