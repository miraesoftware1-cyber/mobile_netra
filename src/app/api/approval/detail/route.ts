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
  const apvRes = await fetch(`${baseUrl}/R2JsonProc.asp?${apvParams}`, { cache: 'no-store' }).catch(() => null);
  const apvData = await apvRes?.json().catch(() => null);
  const stepApprovers: { EMP_CODE: string }[] = apvData?.items ?? [];

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
    steps:       stepApprovers.map((r) => ({
      STEP_NO:   currentStep,
      APV_TYPE:  '',
      EMP_CODE:  r.EMP_CODE,
      EMP_NAME:  '',
      THRESHOLD: 1,
    })),
    actions:     [],
  });
}
