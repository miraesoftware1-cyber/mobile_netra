/** 현재 KST 시각이 무음 알림 시간대에 속하는지 확인합니다. */
export function isInQuietHours(
  quietStart:   string | null | undefined,
  quietEnd:     string | null | undefined,
  quietEnabled: boolean | null | undefined,
): boolean {
  if (!quietEnabled || !quietStart || !quietEnd) return false;

  // UTC+9 (KST) 기준 현재 시각
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const current = kst.getUTCHours() * 60 + kst.getUTCMinutes();

  const [sh, sm] = quietStart.split(':').map(Number);
  const [eh, em] = quietEnd.split(':').map(Number);
  const start = sh * 60 + (sm || 0);
  const end   = eh * 60 + (em || 0);

  // 자정 넘기는 경우 (예: 22:00 ~ 07:00)
  if (start > end) return current >= start || current < end;
  return current >= start && current < end;
}
