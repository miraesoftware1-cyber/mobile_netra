import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';
import { sendPushNotification } from '@/lib/push/send-push';
import { query } from '@/lib/db/postgres';
import webpush from 'web-push';

const actionSchema = z.object({
  companyCode: z.string().min(1),
  corpCode:    z.string().min(1),
  reqId:       z.number().int().min(1),
  empCode:     z.string().min(1),
  empName:     z.string().default(''),
  action:      z.enum(['APPROVED', 'REJECTED']),
  comment:     z.string().default(''),
});

async function pushToEmps(corpCode: string, empCodes: string[], title: string, body: string, reqId: number) {
  if (empCodes.length === 0) return;
  try {
    const placeholders = empCodes.map((_, i) => `$${i + 2}`).join(',');
    const { rows } = await query<{ subscription: webpush.PushSubscription }>(
      `SELECT subscription FROM netra_push_subscriptions WHERE corp_code = $1 AND emp_code IN (${placeholders})`,
      [corpCode, ...empCodes],
    );
    await Promise.allSettled(
      rows.map((row) =>
        sendPushNotification(row.subscription, {
          title,
          body,
          url: `/APVMNG/APVMNG_01?requestId=${reqId}`,
          tag: `approval-${reqId}`,
        }),
      ),
    );
  } catch (err) {
    console.error('[approval/action] 푸쉬 실패:', err);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { companyCode, corpCode, reqId, empCode, empName, action, comment } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status !== 'ok') {
    return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });
  }

  const { baseUrl } = resolved;

  // 1. 승인/반려 처리
  const params = new URLSearchParams({
    proc: 'usp_mobile_apvmng_action',
    param1: String(reqId),
    param2: empCode,
    param3: empName,
    param4: action,
    param5: comment,
  });

  const res = await fetch(`${baseUrl}/R2JsonProc.asp?${params}`, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: '처리 실패' }, { status: 502 });

  const data = await res.json().catch(() => null);
  if (String(data?.Flag) !== '0') {
    return NextResponse.json({ error: data?.MSG || '처리 실패' }, { status: 400 });
  }

  const row = data?.items?.[0] ?? {};
  const newStatus: string  = String(row.NEW_STATUS ?? '');
  const nextStepNo: number = Number(row.NEXT_STEP_NO ?? 0);

  // 2. 요청자 정보 조회 (알림 내용용)
  let reqEmpCode = '';
  let reqEmpName = '';
  let menuName   = '';
  try {
    const infoParams = new URLSearchParams({ proc: 'usp_mobile_apvmng_req_info', param1: String(reqId) });
    const infoRes = await fetch(`${baseUrl}/R2JsonProc.asp?${infoParams}`, { cache: 'no-store' }).catch(() => null);
    const infoData = await infoRes?.json().catch(() => null);
    const infoRow = infoData?.items?.[0] ?? {};
    reqEmpCode = String(infoRow.REQ_EMP_CODE ?? '');
    reqEmpName = String(infoRow.REQ_EMP_NAME ?? '');
    menuName   = String(infoRow.MENU_ID ?? '');
  } catch { /* 무시 */ }

  // 3. 다음 단계 승인자에게 푸시 (단계 넘어갔을 때)
  if (nextStepNo > 0) {
    try {
      const apvParams = new URLSearchParams({
        proc: 'usp_mobile_apvmng_step_approvers',
        param1: String(reqId),
        param2: String(nextStepNo),
      });
      const apvRes = await fetch(`${baseUrl}/R2JsonProc.asp?${apvParams}`, { cache: 'no-store' }).catch(() => null);
      const apvData = await apvRes?.json().catch(() => null);
      const nextEmpCodes: string[] = (apvData?.items ?? []).map((r: Record<string, unknown>) => String(r.EMP_CODE ?? '')).filter(Boolean);

      await pushToEmps(
        corpCode,
        nextEmpCodes,
        `${menuName || '승인'} 요청 — ${nextStepNo}단계`,
        `${reqEmpName || '신청자'}님의 요청을 검토해 주세요.`,
        reqId,
      );
    } catch (err) {
      console.error('[approval/action] 다음단계 승인자 조회 실패:', err);
    }
  }

  // 4. 최종 완료(승인/반려) → 요청자에게 푸시
  if ((newStatus === 'APPROVED' || newStatus === 'REJECTED') && reqEmpCode) {
    const isApproved = newStatus === 'APPROVED';
    await pushToEmps(
      corpCode,
      [reqEmpCode],
      isApproved ? '승인 완료' : '반려 처리',
      isApproved
        ? `${menuName || '요청'}이 최종 승인되었습니다.`
        : `${menuName || '요청'}이 반려되었습니다.`,
      reqId,
    );
  }

  return NextResponse.json({ success: true, newStatus, nextStepNo });
}
