import type { GameItem } from "../schedule/types";
import type { WidgetResponse, WidgetTeam } from "./types";

const KST_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LIVE_REFRESH_MS = 60 * 1000;
// 시작 시각이 지났는데 아직 pre(폴링이 변화를 못 봄)면 5분 뒤 다시 본다
const STALE_PRE_REFRESH_MS = 5 * 60 * 1000;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 위젯용 축약 팀명. 기록실(/record/player.php)의 축약형과 같다: SK로 시작하면 "SK", 나머지는 앞 두 글자 */
export function shortTeamName(name: string): string {
  const n = name.replace(/\s+/g, "");
  if (/^SK/i.test(n)) return "SK";
  return [...n].slice(0, 2).join("");
}

/** KST 기준 날짜 "YYYY-MM-DD" */
function kstDate(ms: number): string {
  return new Date(ms + KST_MS).toISOString().slice(0, 10);
}

/** 다음 날 00:00 KST */
function nextKstMidnight(now: number): Date {
  const d = new Date(kstDate(now) + "T00:00:00+09:00");
  return new Date(d.getTime() + DAY_MS);
}

export interface WidgetGame {
  game: GameItem;
  dateISO: string;
  minute: number | null; // live일 때 폴링으로 본 최신 경과 분
}

function team(t: { name: string; logoUrl: string | null }): WidgetTeam {
  return { name: t.name, shortName: shortTeamName(t.name), logoUrl: t.logoUrl };
}

function minuteLabel(minute: number | null): string | null {
  if (minute === null) return null;
  const half = minute < 30 ? "전반" : minute < 60 ? "후반" : "연장";
  return `${half} ${minute}'`;
}

/**
 * 위젯 4상태
 * - 오늘 경기가 있으면: 시작 전 pre / 진행 중 live / 끝났으면 finished (당일 23:59까지)
 * - 오늘 경기가 없거나 끝난 뒤 자정이 지나면: 다음 경기 next (D-day)
 * games는 이 팀의 시즌 경기 (시간순), now는 epoch ms
 */
export function buildWidget(games: WidgetGame[], now: number): WidgetResponse {
  const today = kstDate(now);
  const todays = games.filter((g) => g.dateISO === today && g.game.startsAt);
  // 하루 두 경기는 없지만, 있다면 끝나지 않은 첫 경기를 우선
  const current = todays.find((g) => g.game.status !== "finished") ?? todays[todays.length - 1];

  if (current) {
    const g = current.game;
    const start = Date.parse(g.startsAt!);
    const base = {
      matchSeq: g.matchSeq,
      startsAt: g.startsAt,
      dateLabel: dateLabel(start),
      timeLabel: g.time,
      ddayLabel: null,
      home: team(g.home),
      away: team(g.away),
      venue: g.venue,
    };
    if (g.status === "live") {
      return {
        ...base,
        state: "live",
        scoreHome: g.scoreHome,
        scoreAway: g.scoreAway,
        minuteLabel: minuteLabel(current.minute),
        nextRefreshAt: new Date(now + LIVE_REFRESH_MS).toISOString(),
      };
    }
    if (g.status === "finished") {
      return {
        ...base,
        state: "finished",
        scoreHome: g.scoreHome,
        scoreAway: g.scoreAway,
        minuteLabel: null,
        nextRefreshAt: nextKstMidnight(now).toISOString(),
      };
    }
    return {
      ...base,
      state: "pre",
      scoreHome: null,
      scoreAway: null,
      minuteLabel: null,
      nextRefreshAt: new Date(start > now ? start : now + STALE_PRE_REFRESH_MS).toISOString(),
    };
  }

  const next = games.find((g) => g.game.startsAt && Date.parse(g.game.startsAt) > now && g.dateISO > today);
  const nextRefreshAt = nextKstMidnight(now).toISOString();
  if (!next) {
    return {
      state: "next",
      matchSeq: null,
      startsAt: null,
      dateLabel: null,
      timeLabel: null,
      ddayLabel: null,
      home: null,
      away: null,
      scoreHome: null,
      scoreAway: null,
      minuteLabel: null,
      venue: null,
      nextRefreshAt,
    };
  }
  const g = next.game;
  const start = Date.parse(g.startsAt!);
  const dday = Math.round((Date.parse(next.dateISO) - Date.parse(today)) / DAY_MS);
  return {
    state: "next",
    matchSeq: g.matchSeq,
    startsAt: g.startsAt,
    dateLabel: dateLabel(start),
    timeLabel: g.time,
    ddayLabel: `D-${dday}`,
    home: team(g.home),
    away: team(g.away),
    scoreHome: null,
    scoreAway: null,
    minuteLabel: null,
    venue: g.venue,
    nextRefreshAt,
  };
}

/** "11.14 (토)" */
function dateLabel(ms: number): string {
  const d = new Date(ms + KST_MS);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}.${dd} (${WEEKDAYS[d.getUTCDay()]})`;
}
