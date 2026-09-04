import { NextRequest, NextResponse } from 'next/server';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';
import { query } from '@/lib/db/postgres';

// GET: 승인 요청 상세 조회
// ?companyCode=...&reqId=...&empCode=...
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const companyCode = searchParams.get('companyCode') ?? '';
  const reqId       = searchParams.get('reqId') ?? '';
  const empCode     = searchParams.get('empCode') ?? '';
  const userId      = searchParams.get('userId') ?? '';

  if (!companyCode || !reqId || !empCode) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status !== 'ok') {
    return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });
  }

  const { baseUrl } = resolved;

  const detailParams = new URLSearchParams({
    proc: 'usp_mobile_apvmng_request_detail',
    param1: reqId,
  });

  const res = await fetch(`${baseUrl}/R2JsonProc.asp?${detailParams}`, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: '조회 실패' }, { status: 502 });

  const data = await res.json().catch(() => null);
  if (String(data?.Flag) !== '0') {
    return NextResponse.json({ error: data?.MSG || '조회 실패' }, { status: 404 });
  }

  const row = data.items?.[0];
  if (!row) return NextResponse.json({ error: '데이터 없음' }, { status: 404 });

  const currentStep: number = Number(row.CURRENT_STEP ?? 1);

  // 현재 단계 승인자 목록 조회 (canAct 판별용)
  const apvParams = new URLSearchParams({
    proc: 'usp_mobile_apvmng_step_approvers',
    param1: reqId,
    param2: String(currentStep),
  });
  // 현재 단계 THRESHOLD 조회 (step_state SP 사용 — step_approvers에는 THRESHOLD 없음)
  const stateParams = new URLSearchParams({
    proc:   'usp_mobile_apvmng_step_state',
    param1: reqId,
    param2: userId || empCode,
  });
  const [apvRes, stateRes] = await Promise.all([
    fetch(`${baseUrl}/R2JsonProc.asp?${apvParams}`, { cache: 'no-store' }).catch(() => null),
    fetch(`${baseUrl}/R2JsonProc.asp?${stateParams}`, { cache: 'no-store' }).catch(() => null),
  ]);
  const apvData   = await apvRes?.json().catch(() => null);
  const stateData = await stateRes?.json().catch(() => null);
  const stepApprovers: { EMP_CODE: string; EMP_NAME?: string }[] = apvData?.items ?? [];
  const threshold: number = Number(stateData?.items?.[0]?.THRESHOLD ?? 1);

  // PG에서 실제 승인/반려 이력 조회 + 현재 단계 처리 여부 확인
  let actions: { STEP_NO: number; EMP_CODE: string; EMP_NAME: string; ACTION: string; COMMENT: string; CREATED_AT: string }[] = [];
  let userAlreadyActed = false;
  try {
    const { rows } = await query<{ step_no: number; apv_name: string; apv_code: string; action: string; comment: string; created_at: string }>(
      `SELECT step_no, COALESCE(apv_name, apv_code) AS apv_name, apv_code, action, COALESCE(comment, '') AS comment, created_at
       FROM netra_apvmng_actions WHERE req_id = $1 ORDER BY created_at ASC`,
      [reqId],
    );
    actions = rows.map((r) => ({
      STEP_NO:    r.step_no,
      EMP_CODE:   r.apv_code,
      EMP_NAME:   r.apv_name,
      ACTION:     r.action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      COMMENT:    r.comment,
      CREATED_AT: r.created_at,
    }));
    userAlreadyActed = rows.some((r) => r.step_no === currentStep && (r.apv_code === empCode || r.apv_code === userId));
  } catch { /* 무시 */ }

  return NextResponse.json({
    reqId:       row.REQ_ID,
    menuId:      row.MENU_ID,
    menuName:    row.MENU_NAME ?? row.MENU_ID ?? '',
    reqEmpCode:  row.REQ_EMP_CODE,
    reqEmpName:  row.REQ_EMP_NAME,
    status:      row.STATUS,
    currentStep,
    totalSteps:  Number(row.TOTAL_STEPS ?? 1),
    createdAt:   row.REG_DT ?? '',
    payload:     (() => { try { return JSON.parse(row.PAYLOAD_JSON); } catch { return {}; } })(),
    procSnapshot: {},
    userAlreadyActed,
    threshold,
    steps: stepApprovers.map((r) => ({
      STEP_NO:   currentStep,
      APV_TYPE:  '',
      EMP_CODE:  r.EMP_CODE,
      EMP_NAME:  r.EMP_NAME ?? '',
      THRESHOLD: threshold,
    })),
    actions,
  });
}
