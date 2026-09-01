interface SmsCodeRecord {
  code: string;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const SMS_CODE_STORE = new Map<string, SmsCodeRecord>();

function cleanup(now: number) {
  for (const [key, record] of SMS_CODE_STORE.entries()) {
    if (record.expiresAt <= now) SMS_CODE_STORE.delete(key);
  }
}

export function issueSmsCode(phoneNumber: string): string {
  const now = Date.now();
  cleanup(now);
  const code = String(Math.floor(Math.random() * 900000) + 100000);
  SMS_CODE_STORE.set(phoneNumber, { code, expiresAt: now + TTL_MS });
  return code;
}

export function validateSmsCode(
  phoneNumber: string,
  code: string,
): { success: true } | { success: false; reason: "expired" | "mismatch" } {
  const now = Date.now();
  cleanup(now);

  const record = SMS_CODE_STORE.get(phoneNumber);
  if (!record) return { success: false, reason: "expired" };
  if (record.code !== code) return { success: false, reason: "mismatch" };

  SMS_CODE_STORE.delete(phoneNumber);
  return { success: true };
}
