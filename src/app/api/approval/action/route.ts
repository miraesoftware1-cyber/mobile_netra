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

async function erpGet(baseUrl: string, proc: string, params: Record<string, string>) {
  const p = new URLSearchParams({ proc, ...params });
  const res = await fetch(`${baseUrl}/R2JsonProc.asp?${p}`, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) {
    const body = await res?.text().catch(() => '');
    console.log(`[erpGet] ${proc} http:${res?.status} body:`, body?.slice(0, 100));
    return null;
  }
  return res.json().catch(() => null);
}

async function ensureActionsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS netra_apvmng_actions (
      id        SERIAL PRIMARY KEY,
      req_id    INTEGER      NOT NULL,
      step_no   INTEGER      NOT NULL,
      apv_code  VARCHAR(50)  NOT NULL,
      apv_name  VARCHAR(100),
      action    VARCHAR(20)  NOT NULL,
      comment   TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function pushToEmps(
  corpCode: string, empCodes: string[], title: string, body: string, reqId: number,
  approvalMeta?: { companyCode: string; corpCode: string },
) {
  if (empCodes.length === 0) return;
  try {
    const placeholders = empCodes.map((_, i) => `$${i + 2}`).join(',');
    const { rows } = await query<{ subscription: webpush.PushSubscription; emp_code: string }>(
      `SELECT subscription, emp_code FROM netra_push_subscriptions WHERE corp_code = $1 AND emp_code IN (${placeholders})`,
      [corpCode, ...empCodes],
    );
    await Promise.allSettled(
      rows.map((row) =>
        sendPushNotification(row.subscription, {
          title,
          body,
          url: `/APVMNG/APVMNG_01?requestId=${reqId}`,
          tag: `approval-${reqId}`,
          ...(approvalMeta ? {
            approvalAction: {
              reqId,
              companyCode: approvalMeta.companyCode,
              corpCode:    approvalMeta.corpCode,
              empCode:     row.emp_code,
              empName:     '',
            },
          } : {}),
        }),
      ),
    );
  } catch (err) {
    console.error('[action] 푸쉬 실패:', err);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { companyCode, corpCode, reqId, empCode, empName, action, comment } = parsed.data;
  const erpAction = action === 'APPROVED' ? 'APPROVE' : 'REJECT';
  console.log('[action] start reqId:', reqId, 'empCode:', empCode, 'action:', erpAction);

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status !== 'ok') {
    return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });
  }
  const { baseUrl } = resolved;

  // 1. 현재 상태 조회 (ERP SELECT only SP)
  const stateData = await erpGet(baseUrl, 'usp_mobile_apvmng_step_state', {
    param1: String(reqId),
    param2: empCode,
  });
  console.log('[action] step_state Flag:', stateData?.Flag, 'items:', stateData?.items?.length);
  const stateRow = stateData?.items?.[0];
  if (!stateRow) return NextResponse.json({ error: '요청을 찾을 수 없습니다.' }, { status: 404 });

  const curStep:   number = Number(stateRow.CURRENT_STEP ?? 1);
  const totSteps:  number = Number(stateRow.TOTAL_STEPS  ?? 1);
  const status:    string = String(stateRow.STATUS        ?? '');
  const threshold: number = Number(stateRow.THRESHOLD     ?? 1);

  if (status !== 'PENDING') return NextResponse.json({ error: '이미 처리된 요청입니다.' }, { status: 400 });

  // 2. PG 테이블에서 중복 처리 및 승인 수 확인
  await ensureActionsTable();

  const { rows: existing } = await query<{ id: number }>(
    `SELECT id FROM netra_apvmng_actions WHERE req_id=$1 AND step_no=$2 AND apv_code=$3 LIMIT 1`,
    [reqId, curStep, empCode],
  );
  if (existing.length > 0) return NextResponse.json({ error: '이미 처리하셨습니다.' }, { status: 400 });

  // 3. PG에 액션 기록 저장 (ERP INSERT 실패 우회)
  await query(
    `INSERT INTO netra_apvmng_actions (req_id, step_no, apv_code, apv_name, action, comment)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [reqId, curStep, empCode, empName, erpAction, comment],
  );
  console.log('[action] PG insert done');

  // 4. 다음 상태 결정
  let newStatus  = status;
  let nextStepNo = 0;

  if (erpAction === 'REJECT') {
    newStatus = 'REJECTED';
  } else {
    const { rows: approvals } = await query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM netra_apvmng_actions WHERE req_id=$1 AND step_no=$2 AND action='APPROVE'`,
      [reqId, curStep],
    );
    const apvCnt = Number(approvals[0]?.cnt ?? 0);
    console.log('[action] apvCnt:', apvCnt, 'threshold:', threshold);
    if (apvCnt >= threshold) {
      if (curStep < totSteps) {
        newStatus  = 'PENDING';
        nextStepNo = curStep + 1;
      } else {
        newStatus = 'APPROVED';
      }
    }
  }

  // 5. ERP 상태 UPDATE (UPDATE only SP)
  const setStepData = await erpGet(baseUrl, 'usp_mobile_apvmng_set_step', {
    param1: String(reqId),
    param2: newStatus,
    param3: String(nextStepNo > 0 ? nextStepNo : curStep),
  });
  console.log('[action] set_step Flag:', setStepData?.Flag, 'MSG:', setStepData?.MSG);

  // 6. 요청자 정보 조회 (푸쉬용)
  let reqEmpCode = '';
  let reqEmpName = '';
  let menuId     = '';
  let payloadJson: Record<string, unknown> = {};
  try {
    const infoData = await erpGet(baseUrl, 'usp_mobile_apvmng_req_info', { param1: String(reqId) });
    const infoRow  = infoData?.items?.[0] ?? {};
    reqEmpCode = String(infoRow.REQ_EMP_CODE ?? '');
    reqEmpName = String(infoRow.REQ_EMP_NAME ?? '');
    menuId     = String(infoRow.MENU_ID      ?? '');
    try { payloadJson = JSON.parse(String(infoRow.PAYLOAD_JSON ?? '{}')); } catch { /* 무시 */ }
  } catch { /* 무시 */ }

  // 7. 다음 단계 승인자에게 푸시
  if (nextStepNo > 0) {
    try {
      const apvData = await erpGet(baseUrl, 'usp_mobile_apvmng_step_approvers', {
        param1: String(reqId),
        param2: String(nextStepNo),
      });
      const nextEmpCodes: string[] = (apvData?.items ?? [])
        .map((r: Record<string, unknown>) => String(r.EMP_CODE ?? ''))
        .filter(Boolean);
      await pushToEmps(corpCode, nextEmpCodes, `${menuId || '승인'} 요청 — ${nextStepNo}단계`, `${reqEmpName || '신청자'}님의 요청을 검토해 주세요.`, reqId, { companyCode, corpCode });
    } catch { /* 무시 */ }
  }

  // 8. 최종 승인 → LEAVE_01이면 ERP 연차 상태 업데이트
  if (newStatus === 'APPROVED' && menuId === 'LEAVE_01') {
    try {
      const yearSeq      = Number(payloadJson._year_seq ?? 0);
      const year         = String(payloadJson._year     ?? '');
      const empCodeLeave = String(payloadJson._emp_code ?? reqEmpCode);
      if (yearSeq > 0 && year && empCodeLeave) {
        const today  = new Date();
        const pCdate = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        await fetch(`${baseUrl}/R2JsonProc_update_holiday.asp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ detail: [{ p_emp_code: empCodeLeave, p_year: year, p_seq: yearSeq, p_cdate: pCdate }] }),
        }).catch(() => null);
      }
    } catch { /* 무시 */ }
  }

  // 9. 최종 완료 → 요청자에게 푸시
  if ((newStatus === 'APPROVED' || newStatus === 'REJECTED') && reqEmpCode) {
    const isApproved = newStatus === 'APPROVED';
    await pushToEmps(
      corpCode,
      [reqEmpCode],
      isApproved ? '승인 완료' : '반려 처리',
      isApproved ? `${menuId || '요청'}이 최종 승인되었습니다.` : `${menuId || '요청'}이 반려되었습니다.`,
      reqId,
    );
  }

  return NextResponse.json({ success: true, newStatus, nextStepNo });
}
