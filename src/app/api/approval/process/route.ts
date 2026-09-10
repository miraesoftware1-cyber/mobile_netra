import { NextRequest, NextResponse } from 'next/server';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';

// GET: 메뉴별 절차 설정 조회
// ?companyCode=...&menuId=...
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const companyCode = searchParams.get('companyCode') ?? '';
  const menuId = searchParams.get('menuId') ?? '';

  if (!companyCode || !menuId) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status !== 'ok') {
    return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });
  }

  const params = new URLSearchParams({
    proc: 'usp_mobile_apvmng_process_get',
    param1: menuId,
  });

  const res = await fetch(`${resolved.baseUrl}/R2JsonProc.asp?${params}`, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: '조회 실패' }, { status: 502 });

  const data = await res.json().catch(() => null);
  if (!data) return NextResponse.json({ error: '응답 파싱 실패' }, { status: 502 });

  if (String(data.Flag) !== '0') {
    return NextResponse.json({ exists: false, procName: '', steps: [] });
  }

  const items: Record<string, unknown>[] = data.items ?? [];
  const procName = (items[0]?.PROC_NAME as string) ?? '';

  const steps = items.map((item) => ({
    stepNo:             item.STEP_NO,
    type:               item.STEP_TYPE,
    members:            (item.APV_CODE as string)
                          ? [{ empCode: item.APV_CODE, empName: item.APV_NAME }]
                          : [],
    threshold:          item.THRESHOLD,
    allowFinalDecision: item.ALLOW_FINAL_YN === 'Y',
    pushEnabled:        item.PUSH_YN === 'Y',
    messageTitle:       (item.MSG_TITLE as string) ?? '',
    messageBody:        (item.MSG_BODY  as string) ?? '',
  }));

  return NextResponse.json({ exists: true, procName, steps });
}
