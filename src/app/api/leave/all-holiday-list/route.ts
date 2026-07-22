import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';

const isValidString = z.string().min(1).refine((v) => v !== 'undefined' && v !== 'null');

const querySchema = z.object({
  companyCode: isValidString,
  corp_code:   isValidString,
  year:        z.string().regex(/^\d{4}$/),
});

export interface AllHolidayListItem {
  emp_code:    string;
  emp_name:    string;
  holiday_typ: string;
  year_bdate:  string;
  year_edate:  string;
  year_emday:  number;
  year_chk?:   string;
}

interface ApiResponse {
  Flag: string | number;
  MSG:  string;
  items?: AllHolidayListItem[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = querySchema.safeParse({
    companyCode: searchParams.get('companyCode'),
    corp_code:   searchParams.get('corp_code'),
    year:        searchParams.get('year'),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { companyCode, corp_code, year } = parsed.data;
  const resolved = await resolveCompanyErpBaseUrl(companyCode);

  if (resolved.status !== 'ok') {
    return NextResponse.json({ error: '서버 연결 오류입니다.' }, { status: 502 });
  }

  const { baseUrl } = resolved;
  const params = new URLSearchParams({
    proc:   'usp_mobile_get_all_holiday_list',
    param1: corp_code,
    param2: year,
  });

  const erpRes = await fetch(`${baseUrl}/R2JsonProc.asp?${params.toString()}`).catch(() => null);

  if (!erpRes?.ok) {
    return NextResponse.json({ error: '전체 연차/휴가 조회 중 오류가 발생했습니다.' }, { status: 502 });
  }

  const data: ApiResponse = await erpRes.json();
  const flag = String(data.Flag ?? '');

  if (flag === '-1') {
    return NextResponse.json({ items: [], message: data.MSG?.trim() || '조회된 데이터가 없습니다.' });
  }

  if (flag !== '0') {
    return NextResponse.json({ error: data.MSG || '조회에 실패했습니다.' }, { status: 400 });
  }

  return NextResponse.json({ items: data.items ?? [] });
}
