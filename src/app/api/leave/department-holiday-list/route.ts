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
  manage_dpt_codes: z.string(),
});

interface DepartmentHolidayListApiItem {
  emp_code: string;
  emp_name: string;
  dpt_name?: string;
  year_emday: number;
  holiday_typ: string;
  year_bdate: string;
  year_edate: string;
}

interface DepartmentHolidayListApiResponse {
  Flag: string | number;
  MSG: string;
  items?: DepartmentHolidayListApiItem[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = querySchema.safeParse({
    companyCode: searchParams.get('companyCode'),
    corp_code: searchParams.get('corp_code'),
    year: searchParams.get('year'),
    manage_dpt_codes: searchParams.get('manage_dpt_codes'),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { companyCode, corp_code, year, manage_dpt_codes } = parsed.data;

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
    proc: 'usp_mobile_get_my_dpt_holiday_list',
    param1: corp_code,
    param2: year,
    param3: manage_dpt_codes,
  });

  const listRes = await fetch(`${baseUrl}/R2JsonProc.asp?${params.toString()}`).catch(
    () => null
  );

  if (!listRes?.ok) {
    return NextResponse.json(
      { error: '부서 연차/휴가 조회 중 오류가 발생했습니다.' },
      { status: 502 }
    );
  }

  const listData: DepartmentHolidayListApiResponse = await listRes.json();
  const flag = String(listData.Flag ?? '');

  if (flag === '-1') {
    return NextResponse.json({
      items: [] as DepartmentHolidayListApiItem[],
      message: listData.MSG?.trim() || '조회된 데이터가 없습니다.',
    });
  }

  if (flag !== '0') {
    return NextResponse.json(
      { error: listData.MSG || '부서 연차/휴가 내역을 조회하지 못했습니다.' },
      { status: 400 }
    );
  }

  return NextResponse.json({ items: listData.items ?? [] });
}
