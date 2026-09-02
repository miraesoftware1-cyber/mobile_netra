import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

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

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      emp_code,
      corp_code,
      manage_dpt_codes,
      subscription,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_code,subscription_endpoint", ignoreDuplicates: false },
  );

  if (error) {
    // upsert 실패 시 insert 시도 (컬럼 문제 대비)
    const { error: insertError } = await supabase.from("push_subscriptions").upsert(
      { emp_code, corp_code, manage_dpt_codes, subscription, updated_at: new Date().toISOString() },
    );
    if (insertError) {
      console.error("[push/subscribe] DB 저장 실패:", insertError);
      return NextResponse.json({ error: "구독 저장에 실패했습니다." }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
