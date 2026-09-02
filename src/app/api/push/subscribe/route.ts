import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db/postgres";

const schema = z.object({
  subscription: z.object({
    endpoint: z.string(),
    keys: z.object({ p256dh: z.string(), auth: z.string() }),
  }),
  emp_code: z.string(),
  corp_code: z.string(),
  manage_dpt_codes: z.string(),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { subscription, emp_code, corp_code, manage_dpt_codes } = parsed.data;

  try {
    await query(
      `INSERT INTO netra_push_subscriptions (emp_code, corp_code, manage_dpt_codes, subscription, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (emp_code) DO UPDATE SET
         corp_code = $2,
         manage_dpt_codes = $3,
         subscription = $4,
         updated_at = NOW()`,
      [emp_code, corp_code, manage_dpt_codes, JSON.stringify(subscription)],
    );
  } catch (err) {
    console.error("[push/subscribe] DB 저장 실패:", err);
    return NextResponse.json({ error: "구독 저장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
