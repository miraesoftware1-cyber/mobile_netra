import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';
import { query } from '@/lib/db/postgres';

// 단계별 푸시 메시지 설정 (PostgreSQL)
let _tableEnsured = false;

async function ensureMsgTable() {
  if (_tableEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS netra_apvmng_step_msg (
      id           SERIAL PRIMARY KEY,
      menu_id      VARCHAR(50) NOT NULL,
      step_type    VARCHAR(20) NOT NULL,
      msg_title    VARCHAR(200),
      msg_body     VARCHAR(500),
      updated_at   TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(menu_id, step_type)
    )
  `);
  _tableEnsured = true;
}

// GET: 메뉴별 절차 설정 조회 (ERP) + 푸시 메시지 (PG 오버레이)
// ?companyCode=...&menuId=...
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const companyCode = searchParams.get('companyCode') ?? '';
  const menuId      = searchParams.get('menuId')      ?? '';

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

  if (String(data.Flag) !== '0') {
    return NextResponse.json({ exists: false, procName: '', steps: [] });
  }

  const items: Record<string, unknown>[] = data.items ?? [];
  const procName = (items[0]?.PROC_NAME as string) ?? '';

  // PG에서 커스텀 푸시 메시지 조회 (없으면 ERP 기본값 사용)
  await ensureMsgTable();
  const { rows: msgRows } = await query<{ step_type: string; msg_title: string | null; msg_body: string | null }>(
    'SELECT step_type, msg_title, msg_body FROM netra_apvmng_step_msg WHERE menu_id = $1',
    [menuId],
  ).catch(() => ({ rows: [] as { step_type: string; msg_title: string | null; msg_body: string | null }[] }));
  const msgMap = new Map(msgRows.map((r) => [r.step_type, r]));

  const steps = items.map((item) => {
    const stepType = (item.STEP_TYPE as string) ?? '';
    const pgMsg = msgMap.get(stepType);
    return {
      stepNo:       item.STEP_NO,
      type:         stepType,
      pushEnabled:  item.PUSH_YN === 'Y',
      messageTitle: pgMsg?.msg_title ?? (item.MSG_TITLE as string) ?? '',
      messageBody:  pgMsg?.msg_body  ?? (item.MSG_BODY  as string) ?? '',
    };
  });

  return NextResponse.json({ exists: true, procName, steps });
}

const postSchema = z.object({
  menuId: z.string().min(1),
  steps:  z.array(z.object({
    type:         z.string().min(1),
    messageTitle: z.string().default(''),
    messageBody:  z.string().default(''),
  })),
});

// POST: 단계별 푸시 메시지만 PostgreSQL에 저장 (단계 설정 자체는 MyBuilder/ERP에서 관리)
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });

  const { menuId, steps } = parsed.data;

  await ensureMsgTable();
  for (const step of steps) {
    await query(
      `INSERT INTO netra_apvmng_step_msg (menu_id, step_type, msg_title, msg_body)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (menu_id, step_type)
       DO UPDATE SET msg_title = EXCLUDED.msg_title, msg_body = EXCLUDED.msg_body, updated_at = NOW()`,
      [menuId, step.type, step.messageTitle || null, step.messageBody || null],
    );
  }

  return NextResponse.json({ success: true });
}
