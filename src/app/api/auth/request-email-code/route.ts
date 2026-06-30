import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { issueEmailCode } from '@/app/api/auth/_lib/email-code-store';
import { isAuthEmailVerificationEnabled } from '@/app/api/auth/_lib/email-verification-enabled';
import { sendLoginVerificationCode } from '@/lib/mail/send-login-verification-code';

const requestEmailCodeSchema = z.object({
  email: z.string().email('유효한 이메일 형식이 아닙니다.'),
});

export async function POST(request: NextRequest) {
  if (!isAuthEmailVerificationEnabled()) {
    return NextResponse.json(
      { error: '이메일 인증이 비활성화되어 있습니다.' },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = requestEmailCodeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { email } = parsed.data;
  const code = issueEmailCode(email);

  const sendResult = await sendLoginVerificationCode(email, code);
  if (!sendResult.success) {
    return NextResponse.json({ error: sendResult.error }, { status: 503 });
  }

  return NextResponse.json({ success: true });
}
