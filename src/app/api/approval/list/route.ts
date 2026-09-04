import { NextRequest, NextResponse } from 'next/server';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';
import { query } from '@/lib/db/postgres';

async function fetchErpList(baseUrl: string, erpId: string, status: string) {
  const params = new URLSearchParams({
    proc: 'usp_mobile_apvmng_request_list',
    param1: erpId,
    param2: status,
  });
  const res = await fetch(`${baseUrl}/R2JsonProc.asp?${params}`, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return [];
  const data = await res.json().catch(() => null);
  return (data?.items ?? []).map((row: Record<string, unknown>) => ({
    REQ_ID:       Number(row.REQ_ID),
    MENU_NAME:    String(row.MENU_NAME ?? row.MENU_ID ?? ''),
    REQ_EMP_NAME: String(row.REQ_EMP_NAME ?? ''),
    CURRENT_STEP: row.CURRENT_STEP,
    TOTAL_STEPS:  row.TOTAL_STEPS,
    THRESHOLD:    row.THRESHOLD != null ? Number(row.THRESHOLD) : null,
    STATUS:       String(row.STATUS ?? ''),
    CREATED_AT:   String(row.CREATED_AT ?? row.REG_DT ?? ''),
  }));
}

// GET: 내 승인 대기/처리완료 목록
// ?companyCode=...&empCode=...&status=PENDING|APPROVED
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const companyCode = searchParams.get('companyCode') ?? '';
  const empCode     = searchParams.get('empCode') ?? '';
  const userId      = searchParams.get('userId') ?? '';
  const status      = searchParams.get('status') ?? 'PENDING';
  // ERP는 USER_ID로 조회 (그룹 승인자 등록 시 USER_ID 사용), PG는 empCode로 조회
  const erpId = userId || empCode;

  if (!companyCode || !empCode) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status !== 'ok') {
    return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });
  }
  const { baseUrl } = resolved;

  // PG에서 이미 처리한 (req_id, step_no) 쌍 조회 — 단계별로 체크해야 다단계 승인자 누락 방지
  let actedKeys: Set<string> = new Set();
  let actedReqIds: Set<number> = new Set(); // 처리완료 탭용
  try {
    const { rows } = await query<{ req_id: number; step_no: number }>(
      `SELECT req_id, step_no FROM netra_apvmng_actions WHERE apv_code = $1`,
      [empCode],
    );
    actedKeys  = new Set(rows.map((r) => `${r.req_id}:${r.step_no}`));
    actedReqIds = new Set(rows.map((r) => Number(r.req_id)));
  } catch { /* 무시 */ }

  if (status === 'PENDING') {
    // ERP PENDING 목록에서 현재 단계를 이미 처리한 항목만 제외
    const items = await fetchErpList(baseUrl, erpId, 'PENDING');
    const filtered = items.filter((item) => !actedKeys.has(`${item.REQ_ID}:${item.CURRENT_STEP}`));

    // PG에서 현재 단계 승인 수 조회
    if (filtered.length > 0) {
      try {
        const reqIds = filtered.map((i) => i.REQ_ID);
        const ph = reqIds.map((_, i) => `$${i + 1}`).join(',');
        const { rows: cntRows } = await query<{ req_id: number; step_no: number; cnt: string }>(
          `SELECT req_id, step_no, COUNT(*)::text AS cnt FROM netra_apvmng_actions
           WHERE req_id IN (${ph}) AND action = 'APPROVE' GROUP BY req_id, step_no`,
          reqIds,
        );
        const cntMap = new Map(cntRows.map((r) => [`${r.req_id}:${r.step_no}`, Number(r.cnt)]));
        return NextResponse.json({
          items: filtered.map((item) => ({
            ...item,
            APPROVE_CNT: cntMap.get(`${item.REQ_ID}:${item.CURRENT_STEP}`) ?? 0,
          })),
        });
      } catch { /* 무시 */ }
    }

    return NextResponse.json({ items: filtered });
  }

  // status === 'APPROVED': 처리완료 탭 (APPROVED + REJECTED + 내가 처리한 진행중)
  const [approvedItems, rejectedItems] = await Promise.all([
    fetchErpList(baseUrl, erpId, 'APPROVED'),
    fetchErpList(baseUrl, erpId, 'REJECTED'),
  ]);
  // 내가 실제로 처리한 건만 표시 (등록만 된 건 제외)
  const erpItems = [...approvedItems, ...rejectedItems].filter((i) => actedReqIds.has(i.REQ_ID));
  const erpReqIds = new Set(erpItems.map((i) => i.REQ_ID));

  // PG에서 처리했으나 아직 ERP에서 PENDING인 항목 추가
  try {
    const { rows: pgRows } = await query<{
      req_id: number; acted_step: number; action: string;
      menu_id: string; req_emp_code: string; req_emp_name: string; created_at: string;
    }>(
      `SELECT DISTINCT ON (a.req_id)
         a.req_id, a.step_no AS acted_step, a.action, a.created_at,
         r.menu_id, r.emp_code AS req_emp_code, COALESCE(r.req_emp_name, r.emp_code) AS req_emp_name
       FROM netra_apvmng_actions a
       JOIN netra_apvmng_requests r ON r.req_id = a.req_id
       WHERE a.apv_code = $1
       ORDER BY a.req_id, a.created_at DESC`,
      [empCode],
    );
    const pgOnlyItems = pgRows
      .filter((r) => !erpReqIds.has(Number(r.req_id)))
      .map((r) => ({
        REQ_ID:       Number(r.req_id),
        MENU_NAME:    r.menu_id,
        REQ_EMP_NAME: r.req_emp_name,
        CURRENT_STEP: r.acted_step,
        TOTAL_STEPS:  null,
        STATUS:       'IN_PROGRESS',
        CREATED_AT:   r.created_at,
      }));
    return NextResponse.json({ items: [...erpItems, ...pgOnlyItems] });
  } catch {
    return NextResponse.json({ items: erpItems });
  }
}
