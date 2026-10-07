import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres';

async function runCleanup(companyCode?: string) {
  const whereCompany = companyCode ? `AND n.company_code = $1` : '';
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

// POST — 관리자 페이지 "지금 정리 실행" 버튼
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const companyCode = typeof body.companyCode === 'string' ? body.companyCode : undefined;

  const deleted = await runCleanup(companyCode);
  return NextResponse.json({ ok: true, deleted });
}
