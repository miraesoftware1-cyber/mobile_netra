import { query } from "@/lib/db/postgres";

const TTL_MS = 60 * 1000; // 1분
const RATE_LIMIT_WINDOW_MS = 2 * 60 * 60 * 1000; // 2시간
const RATE_LIMIT_MAX = 3;

export async function checkRateLimit(
  phoneNumber: string,
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);

    const { rows } = await query<{ attempts: number; window_start: Date }>(
      `SELECT attempts, window_start FROM netra_sms_rate_limits WHERE phone_number = $1`,
      [phoneNumber],
    );

    if (rows.length === 0 || rows[0].window_start < windowStart) {
      await query(
        `INSERT INTO netra_sms_rate_limits (phone_number, attempts, window_start)
         VALUES ($1, 1, $2)
         ON CONFLICT (phone_number) DO UPDATE SET attempts = 1, window_start = $2`,
        [phoneNumber, now],
      );
      return { allowed: true };
    }

    if (rows[0].attempts >= RATE_LIMIT_MAX) {
      const windowExpiry = rows[0].window_start.getTime() + RATE_LIMIT_WINDOW_MS;
      const retryAfterSeconds = Math.ceil((windowExpiry - now.getTime()) / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    await query(
      `UPDATE netra_sms_rate_limits SET attempts = attempts + 1 WHERE phone_number = $1`,
      [phoneNumber],
    );

    return { allowed: true };
  } catch (err) {
    console.error("[rate-limit] PostgreSQL 오류, 통과 허용:", err);
    return { allowed: true };
  }
}

export async function issueSmsCode(phoneNumber: string): Promise<string> {
  const code = String(Math.floor(Math.random() * 900000) + 100000);
  const expiresAt = new Date(Date.now() + TTL_MS);

  await query(
    `INSERT INTO netra_sms_otp_codes (phone_number, code, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (phone_number) DO UPDATE SET code = $2, expires_at = $3`,
    [phoneNumber, code, expiresAt],
  );

  return code;
}

export async function validateSmsCode(
  phoneNumber: string,
  code: string,
): Promise<{ success: true } | { success: false; reason: "expired" | "mismatch" }> {
  try {
    const { rows } = await query<{ code: string; expires_at: Date }>(
      `SELECT code, expires_at FROM netra_sms_otp_codes WHERE phone_number = $1`,
      [phoneNumber],
    );

    if (rows.length === 0 || rows[0].expires_at < new Date()) {
      await query(`DELETE FROM netra_sms_otp_codes WHERE phone_number = $1`, [phoneNumber]);
      return { success: false, reason: "expired" };
    }

    if (rows[0].code !== code) {
      return { success: false, reason: "mismatch" };
    }

    await query(`DELETE FROM netra_sms_otp_codes WHERE phone_number = $1`, [phoneNumber]);
    return { success: true };
  } catch (err) {
    console.error("[validateSmsCode] PostgreSQL 오류:", err);
    return { success: false, reason: "expired" };
  }
}
