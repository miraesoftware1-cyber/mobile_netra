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

  // 승인 절차 설정 확인 → 있으면 승인 시스템, 없으면 기존 부서장 푸시
  try {
    const procRes = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/approval/process?companyCode=${encodeURIComponent(companyCode)}&menuId=LEAVE_01`,
      { cache: 'no-store' }
    ).catch(() => null);
    const procData = procRes?.ok ? await procRes.json().catch(() => null) : null;

    if (procData?.exists && procData.config?.steps?.length > 0) {
      // ── 승인 절차 시스템 사용 ──────────────────────────────
      const config = procData.config as {
        steps: { stepNo: number; type: string; members: { empCode: string; empName: string }[]; threshold: number; messageTitle: string; messageBody: string }[];
        endMessage: { title: string; body: string };
      };

      // 단계별 승인자 resolve
      const stepApprovers: { stepNo: number; apvType: string; empCode: string; threshold: number }[] = [];
      for (const step of config.steps) {
        if (step.type === 'dept_head') {
          // Postgres에서 해당 부서를 관리하는 사람 찾기
          const { rows: heads } = await query<{ emp_code: string }>(
            `SELECT emp_code FROM netra_push_subscriptions WHERE corp_code = $1 AND manage_dpt_codes LIKE $2`,
            [corp_code, `%${dpt_code}%`],
          );
          for (const h of heads) {
            stepApprovers.push({ stepNo: step.stepNo, apvType: 'DEPT_HEAD', empCode: h.emp_code, threshold: 1 });
          }
        } else {
          const apvType = step.type === 'group' ? 'GROUP' : 'INDIVIDUAL';
          for (const m of step.members ?? []) {
            stepApprovers.push({ stepNo: step.stepNo, apvType, empCode: m.empCode, threshold: step.threshold });
          }
        }
      }

      const step1 = config.steps[0];
      const payloadJson = {
        신청자: emp_name || emp_code,
        휴가종류: leaveTypeCode,
        시작일: startDate,
        종료일: endDate,
        일수: `${usedDays}일`,
        사유: reason || note,
      };

      await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/approval/request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyCode,
            corpCode: corp_code,
            menuId: 'LEAVE_01',
            menuName: '연차 신청',
            reqEmpCode: emp_code,
            reqEmpName: emp_name,
            payloadJson,
            procSnapshot: config,
            totalSteps: config.steps.length,
            stepApprovers,
            stepMessageTitle: step1?.messageTitle ?? '연차 신청 알림',
            stepMessageBody: step1?.messageBody?.replace('{requesterName}', emp_name || emp_code).replace('{menuName}', '연차 신청') ?? `${emp_name || emp_code}님이 연차를 신청했습니다.`,
          }),
        }
      ).catch((err) => console.error('[leave/request] approval/request 실패:', err));

    } else {
      // ── 기존 부서장 직접 푸시 ──────────────────────────────
      const { rows: subscribers } = await query<{ subscription: webpush.PushSubscription; manage_dpt_codes: string }>(
        `SELECT subscription, manage_dpt_codes FROM netra_push_subscriptions WHERE corp_code = $1`,
        [corp_code],
      );
      const targets = subscribers.filter((row) =>
        row.manage_dpt_codes?.split(',').map((c: string) => c.trim()).includes(dpt_code),
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
    }
  } catch (err) {
    console.error('[leave/request] 알림 발송 실패:', err);
  }

  return NextResponse.json({ success: true, message: insertData.MSG });
}
