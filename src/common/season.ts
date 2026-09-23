/** KST 기준 "YYYY-MM-DD" */
export function kstDateString(ms = Date.now()): string {
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 현재 시즌 (시작 연도). 2025 = 25-26 시즌, 11월 개막 → 8월부터 새 시즌으로 본다.
 * `CURRENT_SEASON` 환경변수가 있으면 그 값으로 고정한다 (새 시즌 일정이 나오기 전 등)
 */
export function currentSeason(ms = Date.now()): string {
  const fixed = process.env.CURRENT_SEASON?.trim();
  if (fixed && /^\d{4}$/.test(fixed)) return fixed;
  const [y, m] = kstDateString(ms).split("-").map(Number);
  return String(m >= 8 ? y : y - 1);
}
