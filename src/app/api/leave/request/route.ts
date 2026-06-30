import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';

const requestSchema = z.object({
  companyCode: z.string().min(1),
  emp_code: z.string().min(1),
  year: z.string().regex(/^\d{4}$/),
  leaveTypeCode: z.string().min(1),
  appliedDate: z.string().regex(/^\d{8}$/),
  startDate: z.string().regex(/^\d{8}$/),
  endDate: z.string().regex(/^\d{8}$/),
  usedDays: z.number(),
  note: z.string().default(''),
  reason: z.string().default(''),
  phoneNumber: z.string().default(''),
});

interface InsertHolidayApiResponse {
  Flag: string | number;
  MSG: string;
  items: Array<Record<string, unknown>>;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const {
    companyCode,
    emp_code,
    year,
    leaveTypeCode,
    appliedDate,
    startDate,
    endDate,
    usedDays,
    note,
    reason,
    phoneNumber,
  } = parsed.data;

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
    proc: 'usp_mobile_insert_holiday',
    param1: emp_code,
    param2: year,
    param3: leaveTypeCode,
    param4: appliedDate,
    param5: startDate,
    param6: endDate,
    param7: String(usedDays),
    param8: note,
    param9: reason,
    param10: phoneNumber,
  });

  const insertRes = await fetch(
    `${baseUrl}/R2JsonProc.asp?${params.toString()}`
  ).catch(() => null);

  if (!insertRes?.ok) {
    return NextResponse.json(
      { error: '연차 신청 중 오류가 발생했습니다.' },
      { status: 502 }
    );
  }

  const insertData: InsertHolidayApiResponse = await insertRes.json();

  if (String(insertData.Flag) !== '0') {
    return NextResponse.json(
      { error: insertData.MSG || '연차 신청에 실패했습니다.' },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, message: insertData.MSG });
}
