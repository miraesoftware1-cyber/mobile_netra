import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';

const querySchema = z.object({
  companyCode: z.string().min(1),
  corp_code: z.string().min(1),
  year: z.string().regex(/^\d{4}$/),
  emp_code: z.string(),
});

interface HolidayListApiItem {
  emp_code: string;
  emp_name: string;
  year_alday: number;
  year_reday: number;
  year_emday: number;
  holiday_typ: string;
  year_bdate: string;
  year_edate: string;
  app_status: string;
  year_chk?: string;
}

interface HolidayListApiResponse {
  Flag: string;
  MSG: string;
  items?: HolidayListApiItem[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = querySchema.safeParse({
    companyCode: searchParams.get('companyCode'),
    corp_code: searchParams.get('corp_code'),
    year: searchParams.get('year'),
    emp_code: searchParams.get('emp_code'),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { companyCode, corp_code, year, emp_code } = parsed.data;

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

  const listRes = await fetch(
    `${baseUrl}/R2JsonProc.asp?proc=usp_mobile_get_holiday_list&param1=${encodeURIComponent(corp_code)}&param2=${encodeURIComponent(year)}&param3=${encodeURIComponent(emp_code)}`
  ).catch(() => null);

  if (!listRes?.ok) {
    return NextResponse.json(
      { error: '연차 내역을 조회하는 중 오류가 발생했습니다.' },
      { status: 502 }
    );
  }

  const listData: HolidayListApiResponse = await listRes.json();
  const flag = String(listData.Flag ?? '');

  if (flag === '-1') {
    return NextResponse.json({
      items: [] as HolidayListApiItem[],
      message: listData.MSG?.trim() || '조회된 데이터가 없습니다.',
    });
  }

  if (flag !== '0') {
    return NextResponse.json(
      { error: listData.MSG || '연차 내역을 조회하지 못했습니다.' },
      { status: 400 }
    );
  }

  return NextResponse.json({ items: listData.items ?? [] });
}
