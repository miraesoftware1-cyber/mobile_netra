import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';

const isValidString = z.string().min(1).refine((v) => v !== 'undefined' && v !== 'null');

const querySchema = z.object({
  companyCode: isValidString,
  corp_code: isValidString,
  manage_dpt_codes: isValidString,
  year: z.string().regex(/^\d{4}$/),
});

export interface ApprovalListItem {
  year_rdate: string;
  emp_code: string;
  emp_name: string;
  year_alday: number;
  year_reday: number;
  year_emday: number;
  holiday_typ: string;
  year_bdate: string;
  year_edate: string;
  year_reason: string;
  year_st: string;
  year_seq: string;
}

interface ApprovalListApiResponse {
  Flag: string | number;
  MSG: string;
  items?: ApprovalListItem[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = querySchema.safeParse({
    companyCode: searchParams.get('companyCode'),
    corp_code: searchParams.get('corp_code'),
    manage_dpt_codes: searchParams.get('manage_dpt_codes'),
    year: searchParams.get('year'),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { companyCode, corp_code, manage_dpt_codes, year } = parsed.data;

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
    `${baseUrl}/R2JsonProc.asp?proc=usp_mobile_get_holiday_unapproved_list&param1=${encodeURIComponent(year)}&param2=${encodeURIComponent(corp_code)}&param3=${encodeURIComponent(manage_dpt_codes)}`
  ).catch(() => null);

  if (!listRes?.ok) {
    return NextResponse.json(
      { error: '승인 대기 목록을 조회하는 중 오류가 발생했습니다.' },
      { status: 502 }
    );
  }

  const listData: ApprovalListApiResponse = await listRes.json();
  const flag = String(listData.Flag ?? '');

  if (flag === '-1') {
    return NextResponse.json({
      items: [],
      message: listData.MSG || '조회된 데이터가 없습니다.',
    });
  }

  if (flag !== '0') {
    return NextResponse.json(
      { error: listData.MSG || '승인 대기 목록을 조회하지 못했습니다.' },
      { status: 400 }
    );
  }

  return NextResponse.json({ items: listData.items ?? [] });
}
