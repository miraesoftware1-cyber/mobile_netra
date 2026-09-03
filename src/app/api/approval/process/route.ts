import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';

// GET: 메뉴별 절차 설정 조회
// ?companyCode=...&menuId=...
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const companyCode = searchParams.get('companyCode') ?? '';
  const menuId = searchParams.get('menuId') ?? '';

  if (!companyCode || !menuId) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status !== 'ok') {
    return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });
  }

  const params = new URLSearchParams({
    proc: 'usp_mobile_apvmng_process_get',
    param1: menuId,
  });

  const res = await fetch(`${resolved.baseUrl}/R2JsonProc.asp?${params}`, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: '조회 실패' }, { status: 502 });

  const data = await res.json().catch(() => null);
  if (!data) return NextResponse.json({ error: '응답 파싱 실패' }, { status: 502 });

  // Flag=1 이면 설정 없음 (정상)
  if (String(data.Flag) !== '0') {
    return NextResponse.json({ exists: false, config: null });
  }

  const row = data.items?.[0];
  return NextResponse.json({
    exists: true,
    config: row ? JSON.parse(row.CONFIG_JSON) : null,
    procName: row?.PROC_NAME ?? '',
  });
}

// POST: 절차 설정 저장
const saveSchema = z.object({
  companyCode: z.string().min(1),
  menuId: z.string().min(1),
  procName: z.string().default(''),
  config: z.object({}).passthrough(),  // 자유 형식 JSON
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { companyCode, menuId, procName, config } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status !== 'ok') {
    return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });
  }

  const params = new URLSearchParams({
    proc: 'usp_mobile_apvmng_process_save',
    param1: menuId,
    param2: procName,
    param3: JSON.stringify(config),
  });

  const res = await fetch(`${resolved.baseUrl}/R2JsonProc.asp?${params}`, {
    method: 'GET',
    cache: 'no-store',
  }).catch(() => null);

  if (!res?.ok) return NextResponse.json({ error: '저장 실패' }, { status: 502 });

  const data = await res.json().catch(() => null);
  if (String(data?.Flag) !== '0') {
    return NextResponse.json({ error: data?.MSG || '저장 실패' }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
