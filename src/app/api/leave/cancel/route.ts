import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';

const schema = z.object({
  companyCode: z.string().min(1),
  emp_code: z.string().min(1),
  year: z.string().regex(/^\d{4}$/),
  year_seq: z.number().int(),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { companyCode, emp_code, year, year_seq } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);

  if (resolved.status === 'missing_gateway_env') {
    return NextResponse.json({ error: '서버 설정 오류입니다.' }, { status: 500 });
  }
  if (resolved.status === 'fetch_failed') {
    return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });
  }
  if (resolved.status === 'invalid_company' || resolved.status === 'json_error') {
    return NextResponse.json({ error: '유효하지 않은 회사 코드입니다.' }, { status: 400 });
  }

  const { baseUrl } = resolved;

  const params = new URLSearchParams({
    proc: 'usp_mobile_cancel_holiday',
    param1: emp_code,
    param2: year,
    param3: String(year_seq),
  });

  const res = await fetch(`${baseUrl}/R2JsonProc.asp?${params.toString()}`).catch(() => null);

  if (!res?.ok) {
    return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });
  }

  const data: { Flag: string | number; MSG: string } = await res.json();

  if (String(data.Flag) !== '0') {
    return NextResponse.json(
      { error: data.MSG || '취소 처리에 실패했습니다.' },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, message: data.MSG });
}
