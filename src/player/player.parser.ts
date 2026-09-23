import type { CheerioAPI } from "cheerio";
import { absUrl, intOrNull, splitMadeAttempt, textOrNull } from "../common/scrape";
import type { PlayerSeasonStats } from "./types";

export function emptyStats(): PlayerSeasonStats {
  return {
    games: null,
    goals: 0,
    shots: 0,
    goalRate: null,
    fieldGoals: 0,
    fieldShots: 0,
    goals6m: 0,
    attempts6m: 0,
    goalsWing: 0,
    attemptsWing: 0,
    goals9m: 0,
    attempts9m: 0,
    goals7m: 0,
    attempts7m: 0,
    goalsFast: 0,
    attemptsFast: 0,
    goalsBreakthrough: 0,
    attemptsBreakthrough: 0,
    assists: 0,
    blocks: 0,
    steals: 0,
    turnovers: 0,
    saves: null,
    shotsFaced: null,
    saveRate: null,
    playTime: null,
  };
}

function rate(made: number, attempts: number): number | null {
  return attempts ? Math.round((made / attempts) * 10000) / 100 : null;
}

/** "63.12%" → 63.12 */
export function percentOrNull(x?: string | null): number | null {
  const m = (x ?? "").trim().match(/^(\d+(?:\.\d+)?)\s*%?$/);
  return m ? Number(m[1]) : null;
}

/** 출전시간을 "총 분:초"로. "19:00:05"(시:분:초) → "1140:05", "7189:51" → 그대로, "0" → null */
export function toTotalMinutes(raw?: string | null): string | null {
  const parts = (raw ?? "").trim().split(":");
  if (parts.length < 2 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  const sec = nums.pop()!;
  const min = nums.length === 2 ? nums[0] * 60 + nums[1] : nums[0];
  if (min === 0 && sec === 0) return null;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function playTimeToSec(t: string | null): number {
  if (!t) return 0;
  const [m, s] = t.split(":").map(Number);
  return m * 60 + s;
}

/**
 * 필드 선수 기록 열. `b`는 "득점/슛" 열의 위치.
 * 순서: 득점/슛, %, 필드 득점/슛, %, 6m, 윙, 9m, 7m, 속공, 돌파, EG, E7, 도움, PC, 실책, BD,
 *       블록샷, 스틸, PF, 리바운드, 경고, 2min, 실격, 보고서, 출전시간
 */
export const FIELD_SPAN = 25;
export function fieldStats(c: string[], b: number, games: number | null): PlayerSeasonStats {
  const [goals, shots] = splitMadeAttempt(c[b]);
  const [fieldGoals, fieldShots] = splitMadeAttempt(c[b + 2]);
  const [goals6m, attempts6m] = splitMadeAttempt(c[b + 4]);
  const [goalsWing, attemptsWing] = splitMadeAttempt(c[b + 5]);
  const [goals9m, attempts9m] = splitMadeAttempt(c[b + 6]);
  const [goals7m, attempts7m] = splitMadeAttempt(c[b + 7]);
  const [goalsFast, attemptsFast] = splitMadeAttempt(c[b + 8]);
  const [goalsBreakthrough, attemptsBreakthrough] = splitMadeAttempt(c[b + 9]);
  return {
    ...emptyStats(),
    games,
    goals,
    shots,
    goalRate: shots ? (percentOrNull(c[b + 1]) ?? rate(goals, shots)) : null,
    fieldGoals,
    fieldShots,
    goals6m,
    attempts6m,
    goalsWing,
    attemptsWing,
    goals9m,
    attempts9m,
    goals7m,
    attempts7m,
    goalsFast,
    attemptsFast,
    goalsBreakthrough,
    attemptsBreakthrough,
    assists: intOrNull(c[b + 12]) ?? 0,
    turnovers: intOrNull(c[b + 14]) ?? 0,
    blocks: intOrNull(c[b + 16]) ?? 0,
    steals: intOrNull(c[b + 17]) ?? 0,
    playTime: toTotalMinutes(c[b + 24]),
  };
}

/**
 * 골키퍼 기록 열. `b`는 "세이브/슛" 열의 위치.
 * 순서: 세이브/슛, %, 필드 세이브/슛, %, 실책, 득점/슛, %, 필드 득점/슛, %, 도움,
 *       윙, 6m, 9m, 7m, 속공, 돌파 (유형별 방어), 상단, 중간, 하단, 출전시간
 */
export const GK_SPAN = 20;
export function gkStats(c: string[], b: number, games: number | null): PlayerSeasonStats {
  const [saves, shotsFaced] = splitMadeAttempt(c[b]);
  const [goals, shots] = splitMadeAttempt(c[b + 5]);
  const [fieldGoals, fieldShots] = splitMadeAttempt(c[b + 7]);
  return {
    ...emptyStats(),
    games,
    goals,
    shots,
    goalRate: rate(goals, shots),
    fieldGoals,
    fieldShots,
    assists: intOrNull(c[b + 9]) ?? 0,
    turnovers: intOrNull(c[b + 4]) ?? 0,
    saves,
    shotsFaced,
    saveRate: shotsFaced ? (percentOrNull(c[b + 1]) ?? rate(saves, shotsFaced)) : null,
    playTime: toTotalMinutes(c[b + 19]),
  };
}

/** 시즌별 기록을 더해 통산을 만든다 (정규리그 행 합 = 원본 통산과 일치함을 확인) */
export function sumStats(list: PlayerSeasonStats[]): PlayerSeasonStats {
  const out = emptyStats();
  if (!list.length) return out;
  const numKeys = Object.keys(out).filter(
    (k) => !["games", "goalRate", "saves", "shotsFaced", "saveRate", "playTime"].includes(k),
  ) as (keyof PlayerSeasonStats)[];
  let sec = 0;
  for (const s of list) {
    for (const k of numKeys) (out as any)[k] += (s as any)[k] ?? 0;
    if (s.games !== null) out.games = (out.games ?? 0) + s.games;
    if (s.saves !== null) out.saves = (out.saves ?? 0) + s.saves;
    if (s.shotsFaced !== null) out.shotsFaced = (out.shotsFaced ?? 0) + s.shotsFaced;
    sec += playTimeToSec(s.playTime);
  }
  out.goalRate = rate(out.goals, out.shots);
  out.saveRate = out.shotsFaced ? rate(out.saves ?? 0, out.shotsFaced) : null;
  out.playTime = sec ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : null;
  return out;
}

export function tableRows($: CheerioAPI, $tbody: ReturnType<CheerioAPI>): string[][] {
  return $tbody
    .find("tr")
    .map((_, tr) => [$(tr).find("td").map((__, td) => ($(td).text() ?? "").replace(/\s+/g, " ").trim()).get()])
    .get() as string[][];
}

export interface RosterEntry {
  playerSeq: number;
  name: string;
  number: number | null;
  position: string | null;
  photoUrl: string | null;
}

/** 팀 페이지 "선수 소개" 탭(page_type=3). 카드마다 "CB / No.2" */
export function parseRoster($: CheerioAPI): RosterEntry[] {
  const out: RosterEntry[] = [];
  $(".introduce_staff li a[href*='player_seq=']").each((_, a) => {
    const $a = $(a);
    const seq = ($a.attr("href") ?? "").match(/player_seq=(\d+)/);
    if (!seq) return;
    const title = textOrNull($a.find(".title").text()) ?? "";
    const pos = title.match(/^([A-Za-z]+)\s*\//);
    const no = title.match(/No\.?\s*(\d+)/i);
    out.push({
      playerSeq: Number(seq[1]),
      name: textOrNull($a.find(".name").text()) ?? "",
      number: no ? Number(no[1]) : null,
      position: pos ? pos[1].toUpperCase() : null,
      photoUrl: absUrl($a.find("img").attr("src") ?? null),
    });
  });
  return out;
}
