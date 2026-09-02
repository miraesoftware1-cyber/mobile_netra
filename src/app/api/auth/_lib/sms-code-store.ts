import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface SmsCodeRecord {
  code: string;
  expiresAt: number;
}

const TTL_MS = 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 2 * 60 * 60 * 1000; // 2시간
const RATE_LIMIT_MAX = 3;

// OTP 코드는 1분 TTL이라 인메모리로 충분
const SMS_CODE_STORE = new Map<string, SmsCodeRecord>();

function cleanupCodes(now: number) {
  for (const [key, record] of SMS_CODE_STORE.entries()) {
    if (record.expiresAt <= now) SMS_CODE_STORE.delete(key);
  }
}

// Rate limit은 Supabase에 영구 저장 (서버 재시작 시에도 유지)
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

export function issueSmsCode(phoneNumber: string): string {
  const now = Date.now();
  cleanupCodes(now);
  const code = String(Math.floor(Math.random() * 900000) + 100000);
  SMS_CODE_STORE.set(phoneNumber, { code, expiresAt: now + TTL_MS });
  return code;
}

export function validateSmsCode(
  phoneNumber: string,
  code: string,
): { success: true } | { success: false; reason: "expired" | "mismatch" } {
  const now = Date.now();
  cleanupCodes(now);

  const record = SMS_CODE_STORE.get(phoneNumber);
  if (!record) return { success: false, reason: "expired" };
  if (record.code !== code) return { success: false, reason: "mismatch" };

  SMS_CODE_STORE.delete(phoneNumber);
  return { success: true };
}
