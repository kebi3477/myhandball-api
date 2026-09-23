/** KST 기준 "YYYY-MM-DD" */
export function kstDateString(ms = Date.now()): string {
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 현재 시즌 (시작 연도). 2025 = 25-26 시즌, 11월 개막 → 8월부터 새 시즌으로 본다 */
export function currentSeason(ms = Date.now()): string {
  const [y, m] = kstDateString(ms).split("-").map(Number);
  return String(m >= 8 ? y : y - 1);
}
