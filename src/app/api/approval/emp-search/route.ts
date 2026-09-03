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

  const params = new URLSearchParams({
    proc: 'usp_mobile_apvmng_emp_search',
    param1: keyword,
  });

  const res = await fetch(`${resolved.baseUrl}/R2JsonProc.asp?${params}`, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ items: [] });

  const data = await res.json().catch(() => null);
  if (String(data?.Flag) !== '0') return NextResponse.json({ items: [] });

  return NextResponse.json({
    items: (data.items ?? []) as { EMP_CODE: string; EMP_NAME: string; DPT_NAME: string }[],
  });
}
