import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/postgres';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const empCode  = searchParams.get('empCode') ?? '';
  const userId   = searchParams.get('userId')  ?? '';
  const corpCode = searchParams.get('corpCode');
  if (!corpCode || (!empCode && !userId)) {
    return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 });
  }

  const { rows } = await query<{
    quiet_enabled: boolean;
    quiet_start:   string | null;
    quiet_end:     string | null;
  }>(
    `SELECT quiet_enabled, quiet_start, quiet_end
     FROM netra_user_prefs
     WHERE corp_code=$1 AND (emp_code=$2 OR user_id=$2 OR emp_code=$3 OR user_id=$3)
     LIMIT 1`,
    [corpCode, empCode, userId || empCode],
  ).catch(() => ({ rows: [] }));

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

  await query(
    `INSERT INTO netra_user_prefs (corp_code, emp_code, user_id, quiet_enabled, quiet_start, quiet_end, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (corp_code, emp_code) DO UPDATE SET
       user_id = $3, quiet_enabled = $4, quiet_start = $5, quiet_end = $6, updated_at = NOW()`,
    [corpCode, empCode, userId || null, enabled, start, end],
  );

  return NextResponse.json({ success: true });
}
