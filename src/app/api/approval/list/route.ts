import { NextRequest, NextResponse } from 'next/server';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';
import { query } from '@/lib/db/postgres';

async function fetchErpList(baseUrl: string, empCode: string, status: string) {
  const params = new URLSearchParams({
    proc: 'usp_mobile_apvmng_request_list',
    param1: empCode,
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
  const status      = searchParams.get('status') ?? 'PENDING';

  if (!companyCode || !empCode) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status !== 'ok') {
    return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });
  }
  const { baseUrl } = resolved;

  // PG에서 이미 처리한 req_id 목록 조회
  let actedReqIds: Set<number> = new Set();
  try {
    const { rows } = await query<{ req_id: number }>(
      `SELECT DISTINCT req_id FROM netra_apvmng_actions WHERE apv_code = $1`,
      [empCode],
    );
    actedReqIds = new Set(rows.map((r) => Number(r.req_id)));
  } catch { /* 무시 */ }

  if (status === 'PENDING') {
    // ERP PENDING 목록에서 이미 처리한 항목 제외
    const items = await fetchErpList(baseUrl, empCode, 'PENDING');
    const filtered = items.filter((item) => !actedReqIds.has(item.REQ_ID));
    return NextResponse.json({ items: filtered });
  }

  // status === 'APPROVED': 처리완료 탭 (APPROVED + REJECTED + 내가 처리한 진행중)
  const [approvedItems, rejectedItems] = await Promise.all([
    fetchErpList(baseUrl, empCode, 'APPROVED'),
    fetchErpList(baseUrl, empCode, 'REJECTED'),
  ]);
  const erpItems = [...approvedItems, ...rejectedItems];
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
