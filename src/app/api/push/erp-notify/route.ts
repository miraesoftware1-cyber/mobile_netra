import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/postgres';
import { sendPushNotification } from '@/lib/push/send-push';
import webpush from 'web-push';

const schema = z.object({
  approverEmpCodes: z.array(z.string().min(1)).min(1), // 승인자 emp_code 목록
  corpCode:         z.string().min(1),
  title:            z.string().default('결재 요청'),
  body:             z.string().default('새로운 결재 요청이 있습니다.'),
  url:              z.string().optional(),
  tag:              z.string().optional(),
});

export async function POST(request: NextRequest) {
  // 시크릿 검증
  const secret = request.headers.get('x-erp-secret') ?? '';
  if (!secret || secret !== process.env.ERP_NOTIFY_SECRET) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { approverEmpCodes, corpCode, title, body: msgBody, url, tag } = parsed.data;

  // 승인자들의 모든 기기 구독 조회
  const placeholders = approverEmpCodes.map((_, i) => `$${i + 2}`).join(',');
  const { rows } = await query<{ subscription: webpush.PushSubscription; emp_code: string }>(
    `SELECT subscription, emp_code FROM netra_push_subs WHERE corp_code = $1 AND emp_code IN (${placeholders})`,
    [corpCode, ...approverEmpCodes],
  );

  if (rows.length === 0) {
    return NextResponse.json({ success: true, sent: 0, message: '구독자 없음' });
  }

  const results = await Promise.allSettled(
    rows.map((row) =>
      sendPushNotification(row.subscription, {
        title,
        body: msgBody,
        url:  url ?? '/',
        tag:  tag,
      }),
    ),
  );

  const sent   = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  console.log(`[erp-notify] 푸시 발송: ${sent}성공 / ${failed}실패 / 대상: ${approverEmpCodes.join(',')}`);

  return NextResponse.json({ success: true, sent, failed });
}
