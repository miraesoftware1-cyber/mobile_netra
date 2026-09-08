import { query } from '@/lib/db/postgres';

let _tableEnsured = false;

async function ensurePrefsTable(): Promise<void> {
  if (_tableEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS netra_user_prefs (
      corp_code     VARCHAR(50)  NOT NULL,
      emp_code      VARCHAR(100) NOT NULL,
      user_id       VARCHAR(100),
      quiet_enabled BOOLEAN      NOT NULL DEFAULT FALSE,
      quiet_start   VARCHAR(5),
      quiet_end     VARCHAR(5),
      updated_at    TIMESTAMPTZ  DEFAULT NOW(),
      PRIMARY KEY   (corp_code, emp_code)
    )
  `).catch(() => null);
  _tableEnsured = true;
}

export function isInQuietHours(
  quietStart:   string | null | undefined,
  quietEnd:     string | null | undefined,
  quietEnabled: boolean | null | undefined,
): boolean {
  if (!quietEnabled || !quietStart || !quietEnd) return false;

  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const current = kst.getUTCHours() * 60 + kst.getUTCMinutes();

  const [sh, sm] = quietStart.split(':').map(Number);
  const [eh, em] = quietEnd.split(':').map(Number);
  const start = sh * 60 + (sm || 0);
  const end   = eh * 60 + (em || 0);

  if (start > end) return current >= start || current < end;
  return current >= start && current < end;
}

/**
 * 구독 목록을 무음/일반으로 분류합니다 (netra_user_prefs 기준).
 * - active: 정상 알림 대상
 * - silent: 무음 알림 시간대 → silent: true 페이로드로 발송
 */
export async function categorizeSubscriptions<T extends { emp_code: string; user_id?: string | null }>(
  subs: T[],
  corpCode: string,
): Promise<{ active: T[]; silent: T[] }> {
  if (subs.length === 0) return { active: [], silent: [] };
  await ensurePrefsTable();

  const codes = [...new Set([
    ...subs.map(s => s.emp_code),
    ...subs.map(s => s.user_id).filter((v): v is string => !!v),
  ])];
  const ph = codes.map((_, i) => `$${i + 2}`).join(',');

  const { rows } = await query<{
    emp_code:      string;
    user_id:       string | null;
    quiet_enabled: boolean;
    quiet_start:   string | null;
    quiet_end:     string | null;
  }>(
    `SELECT emp_code, user_id, quiet_enabled, quiet_start, quiet_end
     FROM netra_user_prefs
     WHERE corp_code = $1 AND (emp_code IN (${ph}) OR user_id IN (${ph}))`,
    [corpCode, ...codes],
  ).catch(() => ({ rows: [] }));

  const active: T[] = [];
  const silent: T[] = [];

  for (const s of subs) {
    const pref = rows.find(p =>
      p.emp_code === s.emp_code || p.emp_code === s.user_id ||
      (p.user_id && (p.user_id === s.emp_code || p.user_id === s.user_id))
    );
    if (pref && isInQuietHours(pref.quiet_start, pref.quiet_end, pref.quiet_enabled)) {
      silent.push(s);
    } else {
      active.push(s);
    }
  }

  return { active, silent };
}
