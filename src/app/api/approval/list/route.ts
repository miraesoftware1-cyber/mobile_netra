import { NextRequest, NextResponse } from 'next/server';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';

// GET: 내 승인 대기/처리완료 목록
// ?companyCode=...&empCode=...&status=PENDING|APPROVED|REJECTED|ALL
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

  const params = new URLSearchParams({
    proc: 'usp_mobile_apvmng_request_list',
    param1: empCode,
    param2: status,
  });

  const res = await fetch(`${resolved.baseUrl}/R2JsonProc.asp?${params}`, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: '조회 실패' }, { status: 502 });

  const data = await res.json().catch(() => null);

  const items = (data?.items ?? []).map((row: Record<string, unknown>) => ({
    REQ_ID:       row.REQ_ID,
    MENU_NAME:    row.MENU_NAME ?? row.MENU_ID ?? '',
    REQ_EMP_NAME: row.REQ_EMP_NAME ?? '',
    CURRENT_STEP: row.CURRENT_STEP,
    TOTAL_STEPS:  row.TOTAL_STEPS,
    STATUS:       row.STATUS,
    CREATED_AT:   row.CREATED_AT ?? row.REG_DT ?? '',
  }));

  return NextResponse.json({ items });
}
