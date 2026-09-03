import { NextRequest, NextResponse } from 'next/server';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';

// GET: 승인 요청 상세 조회
// ?companyCode=...&reqId=...&empCode=...
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const companyCode = searchParams.get('companyCode') ?? '';
  const reqId       = searchParams.get('reqId') ?? '';
  const empCode     = searchParams.get('empCode') ?? '';

  if (!companyCode || !reqId || !empCode) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status !== 'ok') {
    return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });
  }

  const params = new URLSearchParams({
    proc: 'usp_mobile_apvmng_request_detail',
    param1: reqId,
    param2: empCode,
  });

  const res = await fetch(`${resolved.baseUrl}/R2JsonProc.asp?${params}`, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: '조회 실패' }, { status: 502 });

  const data = await res.json().catch(() => null);
  if (String(data?.Flag) !== '0') {
    return NextResponse.json({ error: data?.MSG || '조회 실패' }, { status: 404 });
  }

  const row = data.items?.[0];
  if (!row) return NextResponse.json({ error: '데이터 없음' }, { status: 404 });

  return NextResponse.json({
    reqId:       row.REQ_ID,
    menuId:      row.MENU_ID,
    menuName:    row.MENU_NAME,
    reqEmpCode:  row.REQ_EMP_CODE,
    reqEmpName:  row.REQ_EMP_NAME,
    status:      row.STATUS,
    currentStep: row.CURRENT_STEP,
    totalSteps:  row.TOTAL_STEPS,
    createdAt:   row.CREATED_AT,
    updatedAt:   row.UPDATED_AT,
    payload:     (() => { try { return JSON.parse(row.PAYLOAD_JSON); } catch { return {}; } })(),
    procSnapshot: (() => { try { return JSON.parse(row.PROC_SNAPSHOT); } catch { return {}; } })(),
    steps:       data.items2 ?? [],   // 단계별 승인자 목록 (SP가 두 번째 결과셋 반환)
    actions:     data.items3 ?? [],   // 처리 이력
  });
}
