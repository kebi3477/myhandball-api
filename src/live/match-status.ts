import type { MatchStatus } from "./types";

export const LIVE_IDLE_MS = 20 * 60 * 1000; // 마지막 변화 후 이 시간이 지나면 종료로 본다
export const MAX_DURATION_MS = 150 * 60 * 1000; // 시작 후 이 시간이 지나면 종료로 본다

export interface StatusInput {
  startsAt: string | Date | null;
  hasFinalScore: boolean; // 원본에 숫자 점수가 있음 (일정·상세)
  state?: { status: MatchStatus; lastChangeAt: Date | string | null } | null;
  now?: number;
}

/**
 * 경기 상태 판정 (서버 단일 기준)
 * - 폴러가 "경기종료"를 봤으면 finished
 * - 시작 전 → pre
 * - 최근 20분 안에 PBP 변화가 있으면 live
 * - 시작 +150분 경과, 또는 변화가 있다가 20분간 멈춤 → finished
 * - 시작은 지났는데 변화를 한 번도 못 봄 → pre 유지 (연기·미반영, 또는 폴링 불가 사이트)
 *   단 시작 +150분이 지났고 원본에 점수가 있으면 finished
 */
export function computeStatus({ startsAt, hasFinalScore, state, now = Date.now() }: StatusInput): MatchStatus | null {
  if (state?.status === "finished") return "finished";
  const start = startsAt ? new Date(startsAt).getTime() : NaN;
  if (Number.isNaN(start)) return state?.status ?? null;
  if (now < start) return "pre";

  const last = state?.lastChangeAt ? new Date(state.lastChangeAt).getTime() : null;
  const overtime = now >= start + MAX_DURATION_MS;
  if (last !== null) {
    if (!overtime && now - last < LIVE_IDLE_MS) return "live";
    return "finished";
  }
  if (overtime && hasFinalScore) return "finished";
  return "pre";
}
