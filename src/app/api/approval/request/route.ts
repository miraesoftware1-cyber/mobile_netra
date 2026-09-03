import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';
import { sendPushNotification } from '@/lib/push/send-push';
import { query } from '@/lib/db/postgres';
import webpush from 'web-push';

const stepApvSchema = z.object({
  stepNo: z.number().int().min(1),
  apvType: z.enum(['INDIVIDUAL', 'GROUP', 'DEPT_HEAD']),
  empCode: z.string().min(1),
  threshold: z.number().int().min(1).default(1),
});

const requestSchema = z.object({
  companyCode: z.string().min(1),
  corpCode: z.string().min(1),
  menuId: z.string().min(1),
  menuName: z.string().default(''),
  reqEmpCode: z.string().min(1),
  reqEmpName: z.string().default(''),
  payloadJson: z.record(z.unknown()),       // 메뉴별 자유 형식
  procSnapshot: z.record(z.unknown()),      // 절차 설정 스냅샷
  totalSteps: z.number().int().min(1),
  stepApprovers: z.array(stepApvSchema),    // 단계별 승인자 목록 (앱에서 resolve 완료)
  stepMessageTitle: z.string().default(''),  // 1단계 알림 제목
  stepMessageBody: z.string().default(''),   // 1단계 알림 내용
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const {
    companyCode, corpCode, menuId, reqEmpCode, reqEmpName,
    payloadJson, procSnapshot, totalSteps, stepApprovers,
    stepMessageTitle, stepMessageBody,
  } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status !== 'ok') {
    return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });
  }

  const { baseUrl } = resolved;

  // 1. 승인 요청 생성
  const createParams = new URLSearchParams({
    proc: 'usp_mobile_apvmng_request_create',
    param1: menuId,
    param2: reqEmpCode,
    param3: reqEmpName,
    param4: JSON.stringify(payloadJson),
    param5: JSON.stringify(procSnapshot),
    param6: String(totalSteps),
  });

  const createRes = await fetch(`${baseUrl}/R2JsonProc.asp?${createParams}`, { cache: 'no-store' }).catch(() => null);
  if (!createRes?.ok) return NextResponse.json({ error: '요청 생성 실패' }, { status: 502 });

  const createData = await createRes.json().catch(() => null);
  if (String(createData?.Flag) !== '0') {
    return NextResponse.json({ error: createData?.MSG || '요청 생성 실패' }, { status: 400 });
  }

  const reqId: number = createData?.items?.[0]?.REQ_ID ?? 0;
  if (!reqId) return NextResponse.json({ error: '요청 ID 누락' }, { status: 500 });

  // 2. 단계별 승인자 등록
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

  // 3. 1단계 승인자에게 푸쉬 알림 발송
  try {
    const step1Approvers = stepApprovers.filter((a) => a.stepNo === 1);
    const step1EmpCodes = step1Approvers.map((a) => a.empCode);

    if (step1EmpCodes.length > 0) {
      const placeholders = step1EmpCodes.map((_, i) => `$${i + 2}`).join(',');
      const { rows: subscribers } = await query<{ subscription: webpush.PushSubscription; emp_code: string }>(
        `SELECT subscription, emp_code FROM netra_push_subscriptions WHERE corp_code = $1 AND emp_code IN (${placeholders})`,
        [corpCode, ...step1EmpCodes],
      );

      await Promise.allSettled(
        subscribers.map((row) =>
          sendPushNotification(row.subscription, {
            title: stepMessageTitle || '승인 요청',
            body: stepMessageBody || `${reqEmpName}님의 승인 요청이 있습니다.`,
            url: `/APVMNG/APVMNG_01?requestId=${reqId}`,
            tag: `approval-${reqId}`,
          }),
        ),
      );
    }
  } catch (err) {
    console.error('[approval/request] 푸쉬 발송 실패:', err);
  }

  return NextResponse.json({ success: true, reqId });
}
