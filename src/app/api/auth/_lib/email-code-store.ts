interface EmailCodeRecord {
  code: string;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const EMAIL_CODE_STORE = new Map<string, EmailCodeRecord>();

const cleanupExpiredEmailCodes = (now: number) => {
  for (const [email, record] of EMAIL_CODE_STORE.entries()) {
    if (record.expiresAt <= now) {
      EMAIL_CODE_STORE.delete(email);
    }
  }
};

export const issueEmailCode = (email: string) => {
  const now = Date.now();
  cleanupExpiredEmailCodes(now);

  const code = String(Math.floor(Math.random() * 900000) + 100000);
  EMAIL_CODE_STORE.set(email, {
    code,
    expiresAt: now + TTL_MS,
  });

  return code;
};

export const validateEmailCode = (email: string, code: string) => {
  const now = Date.now();
  cleanupExpiredEmailCodes(now);

  const record = EMAIL_CODE_STORE.get(email);
  if (!record) {
    return { success: false as const, reason: 'expired' as const };
  }

  if (record.code !== code) {
    return { success: false as const, reason: 'mismatch' as const };
  }

  EMAIL_CODE_STORE.delete(email);
  return { success: true as const };
};
