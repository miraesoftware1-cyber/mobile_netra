import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';

const querySchema = z.object({
  companyCode: z.string().min(1),
  emp_code: z.string().min(1),
  year: z.string().regex(/^\d{4}$/),
});

interface HolidayInfoApiResponse {
  Flag: string;
  MSG: string;
  items: Array<{
    emp_code: string;
    year_alday: number;
    year_reday: number;
  }>;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = querySchema.safeParse({
    companyCode: searchParams.get('companyCode'),
    emp_code: searchParams.get('emp_code'),
    year: searchParams.get('year'),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { companyCode, emp_code, year } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);

  if (resolved.status === 'missing_gateway_env') {
    return NextResponse.json(
      { error: '서버 설정 오류입니다.' },
      { status: 500 }
    );
  }

  if (resolved.status === 'fetch_failed') {
    return NextResponse.json(
      { error: '서버에 연결할 수 없습니다.' },
      { status: 502 }
    );
  }

  if (
    resolved.status === 'invalid_company' ||
    resolved.status === 'json_error'
  ) {
    return NextResponse.json(
      { error: '유효하지 않은 회사 코드입니다.' },
      { status: 400 }
    );
  }

  const { baseUrl } = resolved;

  const holidayRes = await fetch(
    `${baseUrl}/R2JsonProc.asp?proc=usp_mobile_get_holiday_info&param1=${encodeURIComponent(year)}&param2=${encodeURIComponent(emp_code)}`
  ).catch(() => null);

  if (!holidayRes?.ok) {
    return NextResponse.json(
      { error: '연차 정보를 조회하는 중 오류가 발생했습니다.' },
      { status: 502 }
    );
  }

  const holidayData: HolidayInfoApiResponse = await holidayRes.json();

  if (holidayData.Flag !== '0' || !holidayData.items.length) {
    return NextResponse.json(
      { error: '연차 정보를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  const { year_alday, year_reday } = holidayData.items[0];

  return NextResponse.json({ year_alday, year_reday });
}
