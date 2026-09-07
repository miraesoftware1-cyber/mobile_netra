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

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { subscription, emp_code, user_id, corp_code, manage_dpt_codes } = parsed.data;

  try {
    // endpoint 컬럼 추가 (기기별 구독 관리)
    await query(`ALTER TABLE netra_push_subscriptions ADD COLUMN IF NOT EXISTS user_id VARCHAR(100)`).catch(() => null);
    await query(`ALTER TABLE netra_push_subscriptions ADD COLUMN IF NOT EXISTS endpoint TEXT`).catch(() => null);
    // endpoint 기존 행 채우기
    await query(`UPDATE netra_push_subscriptions SET endpoint = subscription->>'endpoint' WHERE endpoint IS NULL`).catch(() => null);
    // endpoint unique 인덱스 추가
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subs_endpoint ON netra_push_subscriptions (endpoint)`).catch(() => null);
    // emp_code unique 제약 제거 (기기별 다중 구독 허용)
    await query(`DO $$ BEGIN ALTER TABLE netra_push_subscriptions DROP CONSTRAINT IF EXISTS netra_push_subscriptions_emp_code_key; EXCEPTION WHEN OTHERS THEN NULL; END $$`).catch(() => null);

    await query(
      `INSERT INTO netra_push_subscriptions (emp_code, user_id, corp_code, manage_dpt_codes, subscription, endpoint, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (endpoint) DO UPDATE SET
         emp_code = $1,
         user_id = $2,
         corp_code = $3,
         manage_dpt_codes = $4,
         subscription = $5,
         updated_at = NOW()`,
      [emp_code, user_id, corp_code, manage_dpt_codes, JSON.stringify(subscription), subscription.endpoint],
    );
  } catch (err) {
    console.error("[push/subscribe] DB 저장 실패:", err);
    return NextResponse.json({ error: "구독 저장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
