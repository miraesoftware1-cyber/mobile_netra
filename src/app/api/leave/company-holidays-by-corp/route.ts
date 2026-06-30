import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';

const isValidString = z
  .string()
  .min(1)
  .refine((v) => v !== 'undefined' && v !== 'null');

const querySchema = z.object({
  companyCode: isValidString,
  corp_code: isValidString,
  year: z.string().regex(/^\d{4}$/),
});

interface CompanyHolidayApiResponse {
  Flag: string | number;
  MSG: string;
  items?: Array<{
    hdate: string;
    holiday_name: string;
  }>;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = querySchema.safeParse({
    companyCode: searchParams.get('companyCode'),
    corp_code: searchParams.get('corp_code'),
    year: searchParams.get('year'),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { companyCode, corp_code, year } = parsed.data;

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
  const params = new URLSearchParams({
    proc: 'usp_mobile_get_holiday',
    param1: corp_code,
    param2: year,
  });

  const holidayRes = await fetch(`${baseUrl}/R2JsonProc.asp?${params.toString()}`).catch(
    () => null
  );

  if (!holidayRes?.ok) {
    return NextResponse.json(
      { error: '회사 휴일 정보를 조회하는 중 오류가 발생했습니다.' },
      { status: 502 }
    );
  }

  const holidayData: CompanyHolidayApiResponse = await holidayRes.json();
  const flag = String(holidayData.Flag ?? '');

  if (flag === '-1') {
    return NextResponse.json({
      items: [],
      message: holidayData.MSG?.trim() || '조회된 데이터가 없습니다.',
    });
  }

  if (flag !== '0') {
    return NextResponse.json(
      { error: holidayData.MSG || '회사 휴일 정보를 조회하지 못했습니다.' },
      { status: 400 }
    );
  }

  return NextResponse.json({ items: holidayData.items ?? [] });
}
