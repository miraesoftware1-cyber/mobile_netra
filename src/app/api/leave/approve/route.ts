import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { format } from 'date-fns';

import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';

const approveItemSchema = z.object({
  emp_code: z.coerce.string().min(1),
  year_st: z.coerce.string().min(1),
  year_seq: z.coerce.string().min(1),
});

const approveRequestSchema = z.object({
  companyCode: z.string().min(1),
  items: z.array(approveItemSchema).min(1),
});

interface ApproveApiResponse {
  Flag?: string;
  MSG?: string;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const parsed = approveRequestSchema.safeParse(body);
  if (!parsed.success) {
    console.error('[approve] zod validation failed:', JSON.stringify(parsed.error.flatten()));
    console.error('[approve] received body:', JSON.stringify(body));
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { companyCode, items } = parsed.data;

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
  const approveUrl = `${baseUrl}/R2JsonProc_update_holiday.asp`;
  const today = format(new Date(), 'yyyyMMdd');

  const detail = items.map((item) => ({
    p_emp_code: item.emp_code,
    p_year: item.year_st,
    p_seq: Number(item.year_seq),
    p_cdate: today,
  }));

  console.log('[approve] calling:', approveUrl, JSON.stringify({ detail }));

  let approveRes: Response | null = null;
  try {
    approveRes = await fetch(approveUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ detail }),
    });
  } catch (err) {
    console.error('[approve] fetch error (network/connection):', err);
    return NextResponse.json(
      { error: '외부 서버에 연결할 수 없습니다.' },
      { status: 502 }
    );
  }

  if (!approveRes.ok) {
    const errorText = await approveRes.text().catch(() => '');
    console.error('[approve] external API responded with status:', approveRes.status, errorText);
    return NextResponse.json(
      { error: `외부 서버 오류 (${approveRes.status})` },
      { status: 502 }
    );
  }

  const approveData: ApproveApiResponse = await approveRes.json().catch(() => ({}));

  if (approveData.Flag && approveData.Flag !== '0') {
    return NextResponse.json(
      { error: approveData.MSG || '처리에 실패했습니다.' },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    message: approveData.MSG || '승인이 완료되었습니다.',
  });
}
