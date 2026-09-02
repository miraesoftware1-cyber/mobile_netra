import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const TTL_MS = 60 * 1000; // 1분
const RATE_LIMIT_WINDOW_MS = 2 * 60 * 60 * 1000; // 2시간
const RATE_LIMIT_MAX = 3;

// Rate limit: Supabase 영구 저장
export async function checkRateLimit(
  phoneNumber: string,
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);

    const { data } = await supabase
      .from("sms_rate_limits")
      .select("attempts, window_start")
      .eq("phone_number", phoneNumber)
      .single();

    if (!data || new Date(data.window_start) < windowStart) {
      await supabase.from("sms_rate_limits").upsert(
        { phone_number: phoneNumber, attempts: 1, window_start: now.toISOString() },
        { onConflict: "phone_number" },
      );
      return { allowed: true };
    }

    if (data.attempts >= RATE_LIMIT_MAX) {
      const windowExpiry = new Date(data.window_start).getTime() + RATE_LIMIT_WINDOW_MS;
      const retryAfterSeconds = Math.ceil((windowExpiry - now.getTime()) / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    await supabase
      .from("sms_rate_limits")
      .update({ attempts: data.attempts + 1 })
      .eq("phone_number", phoneNumber);

    return { allowed: true };
  } catch (err) {
    console.error("[rate-limit] Supabase 오류, 통과 허용:", err);
    return { allowed: true };
  }
}

// OTP 코드: Supabase 저장 (서버리스 환경에서 인스턴스 간 공유)
export async function issueSmsCode(phoneNumber: string): Promise<string> {
  const code = String(Math.floor(Math.random() * 900000) + 100000);
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

  await supabase.from("sms_otp_codes").upsert(
    { phone_number: phoneNumber, code, expires_at: expiresAt },
    { onConflict: "phone_number" },
  );

  return code;
}

export async function validateSmsCode(
  phoneNumber: string,
  code: string,
): Promise<{ success: true } | { success: false; reason: "expired" | "mismatch" }> {
  try {
    const { data } = await supabase
      .from("sms_otp_codes")
      .select("code, expires_at")
      .eq("phone_number", phoneNumber)
      .single();

    if (!data || new Date(data.expires_at) < new Date()) {
      await supabase.from("sms_otp_codes").delete().eq("phone_number", phoneNumber);
      return { success: false, reason: "expired" };
    }

    if (data.code !== code) {
      return { success: false, reason: "mismatch" };
    }

    await supabase.from("sms_otp_codes").delete().eq("phone_number", phoneNumber);
    return { success: true };
  } catch {
    return { success: false, reason: "expired" };
  }
}
