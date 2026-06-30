import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';

const querySchema = z.object({
  companyCode: z.string().min(1),
});

export interface HolidayTypeItem {
  holi_type_code: string;
  holi_type_name: string;
  subtract_flag: string;
  subtract_val: string | null;
  init_flag: string;
}

interface HolidayTypeApiResponse {
  Flag: string;
  MSG: string;
  items: HolidayTypeItem[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = querySchema.safeParse({
    companyCode: searchParams.get('companyCode'),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { companyCode } = parsed.data;

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

  const holidayTypeRes = await fetch(
    `${baseUrl}/R2JsonProc.asp?proc=usp_mobile_get_holiday_type`
  ).catch(() => null);

  if (!holidayTypeRes?.ok) {
    return NextResponse.json(
      { error: '휴가 구분 정보를 조회하는 중 오류가 발생했습니다.' },
      { status: 502 }
    );
  }

  const holidayTypeData: HolidayTypeApiResponse = await holidayTypeRes.json();

  if (holidayTypeData.Flag !== '0' || !holidayTypeData.items.length) {
    return NextResponse.json(
      { error: '휴가 구분 정보를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  return NextResponse.json({ items: holidayTypeData.items });
}
