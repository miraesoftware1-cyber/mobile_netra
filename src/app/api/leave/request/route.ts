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

  // 승인 절차 및 푸시는 응답과 무관하게 백그라운드로 처리
  runApprovalFlow({
    baseUrl, corp_code, dpt_code, emp_code, emp_name,
    leaveTypeCode, startDate, endDate, usedDays, reason, note,
  }).catch((err) => console.error('[leave/request] approval flow 실패:', err));

  return NextResponse.json({ success: true, message: insertData.MSG });
}

async function runApprovalFlow({
  baseUrl, corp_code, dpt_code, emp_code, emp_name,
  leaveTypeCode, startDate, endDate, usedDays, reason, note,
}: {
  baseUrl: string; corp_code: string; dpt_code: string;
  emp_code: string; emp_name: string; leaveTypeCode: string;
  startDate: string; endDate: string; usedDays: number;
  reason: string; note: string;
}) {
  // 1. 승인 절차 설정 조회
  const procParams = new URLSearchParams({ proc: 'usp_mobile_apvmng_process_get', param1: 'LEAVE_01' });
  const procRes = await fetch(`${baseUrl}/R2JsonProc.asp?${procParams}`, { cache: 'no-store' }).catch(() => null);
  const procRaw = procRes?.ok ? await procRes.json().catch(() => null) : null;

  // 절차 설정 없으면 기존 부서장 직접 푸시
  if (!procRaw || String(procRaw.Flag) !== '0' || !procRaw.items?.[0]?.CONFIG_JSON) {
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
    return;
  }

  const config: {
    steps: { stepNo: number; type: string; members: { empCode: string; empName: string }[]; threshold: number; messageTitle: string; messageBody: string }[];
    endMessage: { title: string; body: string };
  } = JSON.parse(procRaw.items[0].CONFIG_JSON);

  if (!config.steps?.length) return;

  // 2. 단계별 승인자 resolve
  const stepApprovers: { stepNo: number; apvType: string; empCode: string; threshold: number }[] = [];
  for (const step of config.steps) {
    if (step.type === 'dept_head') {
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

  // 3. 승인 요청 생성
  const payloadJson = {
    신청자: emp_name || emp_code,
    휴가종류: leaveTypeCode,
    시작일: startDate,
    종료일: endDate,
    일수: `${usedDays}일`,
    사유: reason || note,
  };

  const createParams = new URLSearchParams({
    proc: 'usp_mobile_apvmng_request_create',
    param1: 'LEAVE_01',
    param2: emp_code,
    param3: emp_name,
    param4: JSON.stringify(payloadJson),
    param5: JSON.stringify(config),
    param6: String(config.steps.length),
  });
  const createRes = await fetch(`${baseUrl}/R2JsonProc.asp?${createParams}`, { cache: 'no-store' }).catch(() => null);
  const createData = await createRes?.json().catch(() => null);
  const reqId: number = createData?.items?.[0]?.REQ_ID ?? 0;

  if (!reqId || String(createData?.Flag) !== '0') return;

  // 4. 단계별 승인자 등록
  for (const apv of stepApprovers) {
    const apvParams = new URLSearchParams({
      proc: 'usp_mobile_apvmng_step_apv_add',
      param1: String(reqId),
      param2: String(apv.stepNo),
      param3: apv.apvType,
      param4: apv.empCode,
      param5: String(apv.threshold),
    });
    await fetch(`${baseUrl}/R2JsonProc.asp?${apvParams}`, { cache: 'no-store' }).catch(() => null);
  }

  // 5. 1단계 승인자에게 푸시
  const step1 = config.steps[0];
  const step1EmpCodes = stepApprovers.filter((a) => a.stepNo === 1).map((a) => a.empCode);
  if (step1EmpCodes.length === 0) return;

  const placeholders = step1EmpCodes.map((_, i) => `$${i + 2}`).join(',');
  const { rows: subs } = await query<{ subscription: webpush.PushSubscription }>(
    `SELECT subscription FROM netra_push_subscriptions WHERE corp_code = $1 AND emp_code IN (${placeholders})`,
    [corp_code, ...step1EmpCodes],
  );
  const msgTitle = step1?.messageTitle ?? '연차 신청 알림';
  const msgBody = (step1?.messageBody ?? '{requesterName}님이 연차를 신청했습니다.')
    .replace('{requesterName}', emp_name || emp_code)
    .replace('{menuName}', '연차 신청');
  await Promise.allSettled(
    subs.map((row) =>
      sendPushNotification(row.subscription, {
        title: msgTitle,
        body: msgBody,
        url: `/APVMNG/APVMNG_01?requestId=${reqId}`,
        tag: `approval-${reqId}`,
      }),
    ),
  );
}
