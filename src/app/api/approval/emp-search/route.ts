import { NextRequest, NextResponse } from 'next/server';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';

// GET: 직원 검색
// ?companyCode=...&keyword=...
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const companyCode = searchParams.get('companyCode') ?? '';
  const keyword     = searchParams.get('keyword') ?? '';
  const listType    = searchParams.get('listType') ?? 'emp'; // 'emp' | 'group'

  if (!companyCode) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status !== 'ok') {
    return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });
  }

  // listType=group → 사용자 그룹 목록 SP, 아니면 직원 목록 SP
  let params: URLSearchParams;
  if (listType === 'group') {
    params = new URLSearchParams({ proc: 'usp_mobile_apvmng_group_list', param1: '' });
  } else if (keyword.trim()) {
    params = new URLSearchParams({ proc: 'usp_mobile_apvmng_emp_search', param1: keyword });
  } else {
    params = new URLSearchParams({ proc: 'usp_mobile_apvmng_emp_list', param1: '' });
  }

  const url = `${resolved.baseUrl}/R2JsonProc.asp?${params}`;
  const res = await fetch(url, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) {
    console.error('[emp-search] HTTP error', res?.status, url);
    return NextResponse.json({ items: [] });
  }

  const data = await res.json().catch(() => null);
  console.log('[emp-search] raw response:', JSON.stringify(data)?.slice(0, 300));
  if (!data) return NextResponse.json({ items: [] });

  // Flag 컬럼 없는 SP도 허용 (R2JsonProc이 rows를 items로 감쌀 때 Flag=undefined)
  const flagOk = data.Flag === undefined || String(data.Flag) === '0';
  if (!flagOk) {
    console.error('[emp-search] bad Flag:', data.Flag, data.MSG);
    return NextResponse.json({ items: [] });
  }

  return NextResponse.json({
    items: (data.items ?? []) as { EMP_CODE: string; EMP_NAME: string; DPT_NAME: string }[],
  });
}
