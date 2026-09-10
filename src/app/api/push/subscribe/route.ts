import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db/postgres";

const schema = z.object({
  subscription: z.object({
    endpoint: z.string(),
    keys: z.object({ p256dh: z.string(), auth: z.string() }),
  }),
  emp_code: z.string(),
  user_id: z.string().default(''),
  corp_code: z.string(),
  manage_dpt_codes: z.string(),
});

let _subsTableEnsured = false;

async function ensureSubsTable() {
  if (_subsTableEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS netra_push_subs (
      endpoint         TEXT        PRIMARY KEY,
      emp_code         VARCHAR(50) NOT NULL,
      user_id          VARCHAR(100),
      corp_code        VARCHAR(50),
      manage_dpt_codes TEXT,
      subscription     JSONB       NOT NULL,
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => null);
  await Promise.all([
    query(`ALTER TABLE netra_push_subs ADD COLUMN IF NOT EXISTS quiet_enabled BOOLEAN DEFAULT FALSE`).catch(() => null),
    query(`ALTER TABLE netra_push_subs ADD COLUMN IF NOT EXISTS quiet_start   VARCHAR(5)`).catch(() => null),
    query(`ALTER TABLE netra_push_subs ADD COLUMN IF NOT EXISTS quiet_end     VARCHAR(5)`).catch(() => null),
  ]);
  await query(`
    INSERT INTO netra_push_subs (endpoint, emp_code, user_id, corp_code, manage_dpt_codes, subscription, updated_at)
    SELECT subscription->>'endpoint', emp_code, user_id, corp_code, manage_dpt_codes, subscription, COALESCE(updated_at, NOW())
    FROM netra_push_subscriptions
    WHERE subscription->>'endpoint' IS NOT NULL
    ON CONFLICT (endpoint) DO NOTHING
  `).catch(() => null);
  _subsTableEnsured = true;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { subscription, emp_code, user_id, corp_code, manage_dpt_codes } = parsed.data;

  try {
    await ensureSubsTable();
    await query(
      `INSERT INTO netra_push_subs (endpoint, emp_code, user_id, corp_code, manage_dpt_codes, subscription, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (endpoint) DO UPDATE SET
         emp_code         = $2,
         user_id          = $3,
         corp_code        = $4,
         manage_dpt_codes = $5,
         subscription     = $6,
         updated_at       = NOW()`,
      [subscription.endpoint, emp_code, user_id, corp_code, manage_dpt_codes, JSON.stringify(subscription)],
    );
    // 기존 테이블도 upsert (하위 호환)
    await query(`ALTER TABLE netra_push_subscriptions ADD COLUMN IF NOT EXISTS user_id VARCHAR(100)`).catch(() => null);
    await query(
      `INSERT INTO netra_push_subscriptions (emp_code, user_id, corp_code, manage_dpt_codes, subscription, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (emp_code) DO UPDATE SET
         user_id          = $2,
         corp_code        = $3,
         manage_dpt_codes = $4,
         subscription     = $5,
         updated_at       = NOW()`,
      [emp_code, user_id, corp_code, manage_dpt_codes, JSON.stringify(subscription)],
    ).catch(() => null);
  } catch (err) {
    console.error("[push/subscribe] DB 저장 실패:", err);
    return NextResponse.json({ error: "구독 저장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const endpoint: string | undefined = body?.endpoint;
  const empCode: string | undefined  = body?.emp_code;
  if (!endpoint && !empCode) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  try {
    if (endpoint) {
      await query(`DELETE FROM netra_push_subs WHERE endpoint = $1`, [endpoint]).catch(() => null);
      await query(`DELETE FROM netra_push_subscriptions WHERE subscription->>'endpoint' = $1`, [endpoint]).catch(() => null);
    } else {
      await query(`DELETE FROM netra_push_subs WHERE emp_code = $1`, [empCode]).catch(() => null);
      await query(`DELETE FROM netra_push_subscriptions WHERE emp_code = $1`, [empCode]).catch(() => null);
    }
  } catch (err) {
    console.error('[push/subscribe] 구독 삭제 실패:', err);
    return NextResponse.json({ error: '구독 삭제 실패' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
