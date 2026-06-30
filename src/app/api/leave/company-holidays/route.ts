import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';

const querySchema = z.object({
  companyCode: z.string().min(1),
  corpCode: z.string().min(1),
  year: z.string().regex(/^\d{4}$/),
});

interface CompanyHolidayApiResponse {
  Flag: string;
  MSG: string;
  items: Array<{
    hdate: string;
    holiday_name: string;
  }>;
}

export interface CompanyHolidayItem {
  hdate: string;
  holiday_name: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = querySchema.safeParse({
    companyCode: searchParams.get('companyCode'),
    corpCode: searchParams.get('corpCode'),
    year: searchParams.get('year'),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { companyCode, corpCode, year } = parsed.data;

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
    `${baseUrl}/R2JsonProc.asp?proc=usp_mobile_get_holiday&param1=${encodeURIComponent(corpCode)}&param2=${encodeURIComponent(year)}`
  ).catch(() => null);

  if (!holidayRes?.ok) {
    return NextResponse.json(
      { error: '휴무 정보를 조회하는 중 오류가 발생했습니다.' },
      { status: 502 }
    );
  }

  const holidayData: CompanyHolidayApiResponse = await holidayRes.json();

  if (holidayData.Flag !== '0') {
    return NextResponse.json(
      { error: '휴무 정보를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  const items: CompanyHolidayItem[] = holidayData.items ?? [];

  return NextResponse.json({ items });
}
