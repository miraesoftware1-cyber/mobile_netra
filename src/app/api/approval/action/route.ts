import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';
import { sendPushNotification } from '@/lib/push/send-push';
import { query } from '@/lib/db/postgres';
import webpush from 'web-push';

const actionSchema = z.object({
  companyCode:  z.string().min(1),
  corpCode:     z.string().min(1),
  reqId:        z.number().int().min(1),
  empCode:      z.string().min(1),
  empName:      z.string().default(''),
  action:       z.enum(['APPROVED', 'REJECTED']),
  comment:      z.string().default(''),
  // 다음 단계 승인자에게 보낼 알림 (선택)
  nextStepApprovers: z.array(z.string()).default([]),
  nextStepTitle: z.string().default(''),
  nextStepBody:  z.string().default(''),
  // 최종 승인 or 반려시 요청자에게 보낼 알림 (선택)
  finalNotify:  z.boolean().default(false),
  reqEmpCode:   z.string().default(''),
  finalTitle:   z.string().default(''),
  finalBody:    z.string().default(''),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const {
    companyCode, corpCode, reqId, empCode, empName, action, comment,
    nextStepApprovers, nextStepTitle, nextStepBody,
    finalNotify, reqEmpCode, finalTitle, finalBody,
  } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status !== 'ok') {
    return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });
  }

  const params = new URLSearchParams({
    proc: 'usp_mobile_apvmng_action',
    param1: String(reqId),
    param2: empCode,
    param3: empName,
    param4: action,
    param5: comment,
  });

  const res = await fetch(`${resolved.baseUrl}/R2JsonProc.asp?${params}`, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: '처리 실패' }, { status: 502 });

  const data = await res.json().catch(() => null);
  if (String(data?.Flag) !== '0') {
    return NextResponse.json({ error: data?.MSG || '처리 실패' }, { status: 400 });
  }

  // 다음 단계 승인자 푸쉬 알림
  if (nextStepApprovers.length > 0) {
    try {
      const placeholders = nextStepApprovers.map((_, i) => `$${i + 2}`).join(',');
      const { rows: subscribers } = await query<{ subscription: webpush.PushSubscription }>(
        `SELECT subscription FROM netra_push_subscriptions WHERE corp_code = $1 AND emp_code IN (${placeholders})`,
        [corpCode, ...nextStepApprovers],
      );
      await Promise.allSettled(
        subscribers.map((row) =>
          sendPushNotification(row.subscription, {
            title: nextStepTitle || '승인 요청',
            body: nextStepBody || '새로운 승인 요청이 있습니다.',
            url: `/APVMNG/APVMNG_01?requestId=${reqId}`,
            tag: `approval-${reqId}`,
          }),
        ),
      );
    } catch (err) {
      console.error('[approval/action] 다음단계 푸쉬 실패:', err);
    }
  }

  // 최종 처리 시 요청자에게 알림
  if (finalNotify && reqEmpCode) {
    try {
      const { rows: subscribers } = await query<{ subscription: webpush.PushSubscription }>(
        `SELECT subscription FROM netra_push_subscriptions WHERE corp_code = $1 AND emp_code = $2`,
        [corpCode, reqEmpCode],
      );
      await Promise.allSettled(
        subscribers.map((row) =>
          sendPushNotification(row.subscription, {
            title: finalTitle || (action === 'APPROVED' ? '승인 완료' : '반려 처리'),
            body: finalBody || (action === 'APPROVED' ? '요청이 최종 승인되었습니다.' : '요청이 반려되었습니다.'),
            url: `/APVMNG/APVMNG_01?requestId=${reqId}`,
            tag: `approval-result-${reqId}`,
          }),
        ),
      );
    } catch (err) {
      console.error('[approval/action] 요청자 푸쉬 실패:', err);
    }
  }

  return NextResponse.json({ success: true });
}
