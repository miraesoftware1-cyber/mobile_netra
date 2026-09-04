import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';
import { query } from '@/lib/db/postgres';

const schema = z.object({
  companyCode: z.string().min(1),
  emp_code:    z.string().min(1),
  year:        z.string().regex(/^\d{4}$/),
  year_seq:    z.number().int(),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { companyCode, emp_code, year, year_seq } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status === 'missing_gateway_env') return NextResponse.json({ error: '서버 설정 오류입니다.' }, { status: 500 });
  if (resolved.status === 'fetch_failed')        return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });
  if (resolved.status === 'invalid_company' || resolved.status === 'json_error')
    return NextResponse.json({ error: '유효하지 않은 회사 코드입니다.' }, { status: 400 });

  const { baseUrl } = resolved;

  // 1. ERP 연차 취소
  const params = new URLSearchParams({
    proc:   'usp_mobile_cancel_holiday',
    param1: emp_code,
    param2: year,
    param3: String(year_seq),
  });

  const res = await fetch(`${baseUrl}/R2JsonProc.asp?${params.toString()}`).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });

  const data: { Flag: string | number; MSG: string } = await res.json();
  if (String(data.Flag) !== '0') {
    return NextResponse.json({ error: data.MSG || '취소 처리에 실패했습니다.' }, { status: 400 });
  }

  // 2. 연동된 승인 요청 취소
  try {
    const { rows } = await query<{ req_id: number }>(
      `SELECT req_id FROM netra_apvmng_requests WHERE emp_code=$1 AND year=$2 AND year_seq=$3 LIMIT 1`,
      [emp_code, year, year_seq],
    );

    if (rows.length > 0) {
      const reqId = rows[0].req_id;

      // ERP 승인 요청 상태를 CANCELLED로 변경
      const setStepParams = new URLSearchParams({
        proc:   'usp_mobile_apvmng_set_step',
        param1: String(reqId),
        param2: 'CANCELLED',
        param3: '1',
      });
      await fetch(`${baseUrl}/R2JsonProc.asp?${setStepParams}`).catch(() => null);

      // PG 액션·요청 매핑 정리
      await query(`DELETE FROM netra_apvmng_actions  WHERE req_id=$1`, [reqId]).catch(() => null);
      await query(`DELETE FROM netra_apvmng_requests WHERE req_id=$1`, [reqId]).catch(() => null);
    }
  } catch (err) {
    console.error('[cancel] 승인 요청 취소 실패:', err);
    // 연차 취소 자체는 성공했으므로 에러를 내지 않음
  }

  return NextResponse.json({ success: true, message: data.MSG });
}
