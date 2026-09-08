import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/postgres';

async function ensureQuietHoursCols() {
  await Promise.all([
    query(`ALTER TABLE netra_push_subs ADD COLUMN IF NOT EXISTS quiet_enabled BOOLEAN DEFAULT FALSE`).catch(() => null),
    query(`ALTER TABLE netra_push_subs ADD COLUMN IF NOT EXISTS quiet_start   VARCHAR(5)`).catch(() => null),
    query(`ALTER TABLE netra_push_subs ADD COLUMN IF NOT EXISTS quiet_end     VARCHAR(5)`).catch(() => null),
  ]);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const empCode  = searchParams.get('empCode') ?? '';
  const userId   = searchParams.get('userId')  ?? '';
  const corpCode = searchParams.get('corpCode');
  if (!corpCode || (!empCode && !userId)) {
    return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 });
  }

  await ensureQuietHoursCols();

  const { rows } = await query<{
    quiet_enabled: boolean;
    quiet_start:   string | null;
    quiet_end:     string | null;
  }>(
    `SELECT quiet_enabled, quiet_start, quiet_end
     FROM netra_push_subs
     WHERE corp_code=$3 AND (emp_code=$1 OR user_id=$1 OR emp_code=$2 OR user_id=$2)
     ORDER BY updated_at DESC LIMIT 1`,
    [empCode, userId || empCode, corpCode],
  ).catch((e) => { console.error('[quiet-hours GET] query error:', e); return { rows: [] }; });

  console.log('[quiet-hours GET] empCode:', empCode, 'userId:', userId, 'corpCode:', corpCode, '→ rows:', rows.length, 'enabled:', rows[0]?.quiet_enabled);

  return NextResponse.json({
    enabled: rows[0]?.quiet_enabled ?? false,
    start:   rows[0]?.quiet_start  ?? '22:00',
    end:     rows[0]?.quiet_end    ?? '07:00',
  });
}

const putSchema = z.object({
  empCode:  z.string().min(1),
  userId:   z.string().default(''),
  corpCode: z.string().min(1),
  enabled:  z.boolean(),
  start:    z.string().regex(/^\d{2}:\d{2}$/),
  end:      z.string().regex(/^\d{2}:\d{2}$/),
});

export async function PUT(request: NextRequest) {
  const body   = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });

  const { empCode, userId, corpCode, enabled, start, end } = parsed.data;

  await ensureQuietHoursCols();
  // emp_code 또는 user_id 둘 다 체크 (user_id ≠ emp_code 거래처 대응)
  const result = await query(
    `UPDATE netra_push_subs
     SET quiet_enabled=$4, quiet_start=$5, quiet_end=$6
     WHERE corp_code=$3 AND (emp_code=$1 OR user_id=$1 OR emp_code=$2 OR user_id=$2)`,
    [empCode, userId || empCode, corpCode, enabled, start, end],
  );
  console.log('[quiet-hours PUT] empCode:', empCode, 'userId:', userId, 'corpCode:', corpCode, 'enabled:', enabled, '→ rowCount:', result.rowCount);

  return NextResponse.json({ success: true });
}
