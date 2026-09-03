import { NextRequest, NextResponse } from 'next/server';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';

// GET: 직원 검색
// ?companyCode=...&keyword=...
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const companyCode = searchParams.get('companyCode') ?? '';
  const keyword     = searchParams.get('keyword') ?? '';

  if (!companyCode) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status !== 'ok') {
    return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });
  }

  // R2JsonProc.asp는 빈값 param을 차단 → keyword 없으면 전체 목록 SP 사용
  const params = keyword.trim()
    ? new URLSearchParams({ proc: 'usp_mobile_apvmng_emp_search', param1: keyword })
    : new URLSearchParams({ proc: 'usp_mobile_apvmng_emp_list' });

  const res = await fetch(`${resolved.baseUrl}/R2JsonProc.asp?${params}`, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ items: [] });

  const data = await res.json().catch(() => null);
  if (!data) return NextResponse.json({ items: [] });

  // Flag 컬럼 없는 SP도 허용 (R2JsonProc이 rows를 items로 감쌀 때 Flag=undefined)
  const flagOk = data.Flag === undefined || String(data.Flag) === '0';
  if (!flagOk) return NextResponse.json({ items: [] });

  return NextResponse.json({
    items: (data.items ?? []) as { EMP_CODE: string; EMP_NAME: string; DPT_NAME: string }[],
  });
}
