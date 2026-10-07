import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/postgres';

type RetentionRule = {
  type: string;
  retention_days: number | null;
  updated_at: string;
};

// GET: 회사별 알림 삭제 주기 규칙 + 타입별 현재 건수 조회
export async function GET(request: NextRequest) {
  const companyCode = request.nextUrl.searchParams.get('companyCode');
  if (!companyCode) return NextResponse.json({ error: 'companyCode required' }, { status: 400 });

  const [rulesResult, countResult] = await Promise.all([
    query<RetentionRule>(
      `SELECT type, retention_days, updated_at
       FROM notification_retention_rules
       WHERE company_code = $1`,
      [companyCode],
    ).catch(() => ({ rows: [] as RetentionRule[] })),

    query<{ type: string; cnt: string }>(
      `SELECT type, COUNT(*) AS cnt
       FROM mobile_notifications
       WHERE company_code = $1
       GROUP BY type`,
      [companyCode],
    ).catch(() => ({ rows: [] as { type: string; cnt: string }[] })),
  ]);

  const countMap = Object.fromEntries(countResult.rows.map((r) => [r.type, Number(r.cnt)]));
  const rulesMap = Object.fromEntries(rulesResult.rows.map((r) => [r.type, r]));

  return NextResponse.json({ rules: rulesMap, counts: countMap });
}

// PUT: 삭제 주기 저장 (upsert)
const putSchema = z.object({
  companyCode: z.string().min(1),
  userId:      z.string().min(1),
  rules: z.array(z.object({
    type:           z.string().min(1),
    retention_days: z.number().int().positive().nullable(),
  })),
});

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '잘못된 파라미터' }, { status: 400 });

  const { companyCode, userId, rules } = parsed.data;

  await Promise.all(
    rules.map((r) =>
      query(
        `INSERT INTO notification_retention_rules (company_code, type, retention_days, updated_at, updated_by)
         VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (company_code, type)
         DO UPDATE SET retention_days = $3, updated_at = NOW(), updated_by = $4`,
        [companyCode, r.type, r.retention_days, userId],
      ),
    ),
  );

  return NextResponse.json({ ok: true });
}
