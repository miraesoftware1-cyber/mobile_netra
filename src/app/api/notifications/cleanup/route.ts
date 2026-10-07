import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres';

type TypeCount = { type: string; count: number };

// 삭제 대상 미리 조회 (preview=true)
async function previewCleanup(companyCode?: string): Promise<TypeCount[]> {
  const whereCompany = companyCode ? 'AND n.company_code = $1' : '';
  const params = companyCode ? [companyCode] : [];

  const result = await query<{ type: string; count: string }>(
    `SELECT n.type, COUNT(*) AS count
     FROM mobile_notifications n
     JOIN notification_retention_rules r
       ON n.company_code = r.company_code AND n.type = r.type
     WHERE r.retention_days IS NOT NULL
       AND n.sent_at < NOW() - (r.retention_days || ' days')::INTERVAL
       ${whereCompany}
     GROUP BY n.type`,
    params,
  );

  return result.rows.map((r) => ({ type: r.type, count: Number(r.count) }));
}

async function runCleanup(companyCode?: string): Promise<number> {
  const whereCompany = companyCode ? 'AND n.company_code = $1' : '';
  const params = companyCode ? [companyCode] : [];

  const result = await query<{ count: string }>(
    `WITH deleted AS (
       DELETE FROM mobile_notifications n
       USING notification_retention_rules r
       WHERE n.company_code = r.company_code
         AND n.type = r.type
         AND r.retention_days IS NOT NULL
         AND n.sent_at < NOW() - (r.retention_days || ' days')::INTERVAL
         ${whereCompany}
       RETURNING n.id
     )
     SELECT COUNT(*) AS count FROM deleted`,
    params,
  );

  return Number(result.rows[0]?.count ?? 0);
}

// GET — Vercel Cron 호출 (매일 02:00 UTC)
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const deleted = await runCleanup();
  console.log(`[notifications/cleanup] cron: deleted ${deleted} rows`);
  return NextResponse.json({ ok: true, deleted });
}

// POST — 관리자 페이지
// body.preview === true 면 삭제 대상 건수만 반환 (실제 삭제 없음)
// body.preview === false 면 실제 삭제 실행
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const companyCode = typeof body.companyCode === 'string' ? body.companyCode : undefined;

  if (body.preview === true) {
    const targets = await previewCleanup(companyCode);
    return NextResponse.json({ ok: true, targets });
  }

  const deleted = await runCleanup(companyCode);
  return NextResponse.json({ ok: true, deleted });
}
