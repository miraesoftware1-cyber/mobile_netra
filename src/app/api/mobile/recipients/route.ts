import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';
import { query } from '@/lib/db/postgres';

const getSchema = z.object({
  companyCode: z.string().min(1),
  corpCode:    z.string().min(1),
  dptCode:     z.string().optional().default(''),
  empName:     z.string().optional().default(''),
  empStatus:   z.string().optional().default('1'),
});

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const parsed = getSchema.safeParse({
    companyCode: searchParams.get('companyCode'),
    corpCode:    searchParams.get('corpCode'),
    dptCode:     searchParams.get('dptCode')   ?? '',
    empName:     searchParams.get('empName')   ?? '',
    empStatus:   searchParams.get('empStatus') ?? '1',
  });

  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 파라미터입니다.' }, { status: 400 });
  }

  const { companyCode, corpCode, dptCode, empName, empStatus } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status === 'missing_gateway_env') return NextResponse.json({ error: 'ERP 설정 오류' }, { status: 500 });
  if (resolved.status === 'fetch_failed')        return NextResponse.json({ error: 'ERP 연결 실패' }, { status: 502 });
  if (resolved.status !== 'ok')                  return NextResponse.json({ error: '사업장 정보 오류' }, { status: 400 });

  const { baseUrl } = resolved;

  const params = new URLSearchParams({
    proc:   'usp_mobile_emp_query',
    param1: corpCode,
    param2: dptCode   || ' ',
    param3: empName   || ' ',
    param4: empStatus || ' ',
  });

  const erpRes = await fetch(`${baseUrl}/R2JsonProc.asp?${params}`, { cache: 'no-store' }).catch(() => null);
  if (!erpRes?.ok) return NextResponse.json({ error: 'ERP 조회 실패' }, { status: 502 });

  const erpData: { Flag: string; MSG: string; items: Record<string, unknown>[] } =
    await erpRes.json().catch(() => null);
  if (!erpData) return NextResponse.json({ error: 'ERP 응답 오류' }, { status: 502 });
  if (erpData.Flag === '-1') return NextResponse.json({ items: [] });
  if (erpData.Flag !== '0')  return NextResponse.json({ error: erpData.MSG }, { status: 400 });

  const items = erpData.items ?? [];

  if (items.length === 0) return NextResponse.json({ items: [] });

  const empCodes = items.map((i) => String(i.emp_code));
  const { rows: subRows } = await query<{ emp_code: string }>(
    `SELECT DISTINCT emp_code FROM netra_push_subs WHERE corp_code = $1 AND emp_code = ANY($2::text[])`,
    [corpCode, empCodes],
  );
  const subscribedSet = new Set(subRows.map((r) => r.emp_code));

  return NextResponse.json({
    items: items.map((i) => ({ ...i, has_subscription: subscribedSet.has(String(i.emp_code)) })),
  });
}
