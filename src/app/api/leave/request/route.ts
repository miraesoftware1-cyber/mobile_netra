import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import webpush from 'web-push';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';
import { sendPushNotification } from '@/lib/push/send-push';
import { query } from '@/lib/db/postgres';

const requestSchema = z.object({
  companyCode: z.string().min(1),
  emp_code: z.string().min(1),
  emp_name: z.string().default(''),
  corp_code: z.string().default(''),
  dpt_code: z.string().default(''),
  year: z.string().regex(/^\d{4}$/),
  leaveTypeCode: z.string().min(1),
  appliedDate: z.string().regex(/^\d{8}$/),
  startDate: z.string().regex(/^\d{8}$/),
  endDate: z.string().regex(/^\d{8}$/),
  usedDays: z.number(),
  note: z.string().default(''),
  reason: z.string().default(''),
  phoneNumber: z.string().default(''),
});

interface InsertHolidayApiResponse {
  Flag: string | number;
  MSG: string;
  items: Array<Record<string, unknown>>;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const {
    companyCode,
    emp_code,
    emp_name,
    corp_code,
    dpt_code,
    year,
    leaveTypeCode,
    appliedDate,
    startDate,
    endDate,
    usedDays,
    note,
    reason,
    phoneNumber,
  } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);

  if (resolved.status === 'missing_gateway_env') {
    return NextResponse.json(
      { error: '서버 설정 오류입니다.' },
      { status: 500 }
    );
  }

  if (resolved.status === 'fetch_failed') {
    return NextResponse.json(
      { error: '서버에 연결할 수 없습니다.' },
      { status: 502 }
    );
  }

  if (
    resolved.status === 'invalid_company' ||
    resolved.status === 'json_error'
  ) {
    return NextResponse.json(
      { error: '유효하지 않은 회사 코드입니다.' },
      { status: 400 }
    );
  }

  const { baseUrl } = resolved;

  const params = new URLSearchParams({
    proc: 'usp_mobile_insert_holiday',
    param1: emp_code,
    param2: year,
    param3: leaveTypeCode,
    param4: appliedDate,
    param5: startDate,
    param6: endDate,
    param7: String(usedDays),
    param8: note,
    param9: reason,
    param10: phoneNumber,
  });

  const insertRes = await fetch(
    `${baseUrl}/R2JsonProc.asp?${params.toString()}`
  ).catch(() => null);

  if (!insertRes?.ok) {
    return NextResponse.json(
      { error: '연차 신청 중 오류가 발생했습니다.' },
      { status: 502 }
    );
  }

  const insertData: InsertHolidayApiResponse = await insertRes.json();

  if (String(insertData.Flag) !== '0') {
    return NextResponse.json(
      { error: insertData.MSG || '연차 신청에 실패했습니다.' },
      { status: 400 }
    );
  }

  // 승인권자에게 푸시 알림 발송 (fire-and-forget)
  void (async () => {
    try {
      const { rows: subscribers } = await query<{ subscription: webpush.PushSubscription; manage_dpt_codes: string }>(
        `SELECT subscription, manage_dpt_codes FROM netra_push_subscriptions WHERE corp_code = $1`,
        [corp_code],
      );

      if (!subscribers.length) return;

      const targets = subscribers.filter((row) =>
        row.manage_dpt_codes
          ?.split(',')
          .map((c: string) => c.trim())
          .includes(dpt_code),
      );

      await Promise.allSettled(
        targets.map((row) =>
          sendPushNotification(row.subscription, {
            title: '연차 신청 알림',
            body: `${emp_name || emp_code}님이 연차를 신청했습니다.`,
            url: '/LEAVE/LEAVE_02',
            tag: 'leave-request',
          }),
        ),
      );
    } catch (err) {
      console.error('[leave/request] 푸시 발송 실패:', err);
    }
  })();

  return NextResponse.json({ success: true, message: insertData.MSG });
}
