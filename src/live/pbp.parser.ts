import type { CheerioAPI } from "cheerio";
import type { LiveEventType } from "./types";

/**
 * playbyplay.php 한 행을 풀어 놓은 것.
 * 원본 열: Match Time | 홈 행동 | Score("h:a", 득점 행에만) | Lead | 원정 행동
 * 표는 전반·후반(연장이 있으면 그 뒤) 순서로 하나씩 있고, 시계는 매 하프 00:00부터 다시 센다
 */
export interface PbpRow {
  half: number; // 1 전반, 2 후반, 3~ 연장
  seq: number; // 하프 안에서의 행 순서
  clock: string; // "29:53" (하프 기준 경기 시계)
  minute: number; // 경기 전체 기준 경과 분 (후반 00:36 → 30)
  homeText: string;
  awayText: string;
  scoreHome: number; // 이 행 시점의 누적 스코어 (득점 없는 행은 직전 값)
  scoreAway: number;
  scoredBy: "home" | "away" | null;
  side: "home" | "away" | null; // 주 행위자 쪽
  type: LiveEventType;
  playerNumber: number | null;
  playerName: string | null;
  action: string; // "속공 GOAL", "2Min 파울", "팀 타임아웃" 등 원문
  assistNumber: number | null;
  assistName: string | null;
}

export interface PbpResult {
  rows: PbpRow[];
  started: boolean; // "경기시작" 행이 있음
  finished: boolean; // "경기종료" 행이 있음
}

const HALF_MINUTES = 30;
const OVERTIME_MINUTES = 5;

function halfOffset(half: number): number {
  if (half <= 2) return (half - 1) * HALF_MINUTES;
  return 2 * HALF_MINUTES + (half - 3) * OVERTIME_MINUTES;
}

function classify(action: string): LiveEventType {
  const a = action.toUpperCase();
  // 대소문자 구분: "GOAL"은 득점, "GoalKeeper"는 골키퍼 표기다
  if (/세이브/.test(action)) return "save";
  if (/\bGOAL\b/.test(action)) return "goal";
  if (/\bSHOT\b/.test(action)) return "shot";
  if (/2MIN/.test(a)) return "twoMinutes";
  if (/^YC\b|경고/.test(a)) return "yellowCard";
  if (/^RC\b|레드|실격/.test(a)) return "redCard";
  if (/^BC\b|블루/.test(a)) return "blueCard";
  if (/타임아웃/.test(a)) return "timeout";
  if (/경기시작|경기종료|전반종료|후반종료|연장/.test(a)) return "period";
  return "other";
}

/** "11 박지섭 7M GOAL ( 44 김태규 7M 획득 )" → 배번·이름·행동·괄호 안 보조 선수 */
function splitActor(text: string) {
  const paren = text.match(/\(\s*(\d+)\s+(\S+)\s+([^)]*)\)\s*$/);
  const main = paren ? text.slice(0, paren.index).trim() : text;
  const m = main.match(/^(\d+)\s+(\S+)\s*(.*)$/);
  return {
    playerNumber: m ? Number(m[1]) : null,
    playerName: m ? m[2] : null,
    action: (m ? m[3] : main).trim(),
    // 괄호 안이 어시스트일 때만 어시스트로 본다 (7M 획득 등은 제외)
    assistNumber: paren && /assist/i.test(paren[3]) ? Number(paren[1]) : null,
    assistName: paren && /assist/i.test(paren[3]) ? paren[2] : null,
  };
}

// 슛을 받은 골키퍼 표기는 행위의 "상대편"일 뿐이라 주 행위자에서 뺀다
const isKeeperOnly = (t: string) => /^\d+\s+\S+\s+GoalKeeper$/i.test(t.trim());

export function parsePbp($: CheerioAPI): PbpResult {
  const rows: PbpRow[] = [];
  let started = false;
  let finished = false;
  let scoreHome = 0;
  let scoreAway = 0;

  $("table").each((i, table) => {
    const half = i + 1;
    $(table)
      .find("tbody tr")
      .each((seq, tr) => {
        const c = $(tr)
          .find("td")
          .map((_, td) => ($(td).text() ?? "").replace(/\s+/g, " ").trim())
          .get() as string[];
        if (c.length < 5) return;
        const [clock, homeText, score, , awayText] = c;
        const cm = clock.match(/^(\d{1,3}):(\d{2})$/);
        if (!cm) return;

        if (/경기시작/.test(homeText + awayText)) started = true;
        if (/경기종료/.test(homeText + awayText)) finished = true;

        let scoredBy: PbpRow["scoredBy"] = null;
        const sm = score.match(/^(\d+)\s*:\s*(\d+)$/);
        if (sm) {
          const h = Number(sm[1]);
          const a = Number(sm[2]);
          scoredBy = h > scoreHome ? "home" : a > scoreAway ? "away" : null;
          scoreHome = h;
          scoreAway = a;
        }

        // 주 행위자: 득점 행이면 득점한 쪽, 아니면 골키퍼 표기만 있는 쪽을 뺀 나머지
        const homeMain = homeText && !isKeeperOnly(homeText);
        const awayMain = awayText && !isKeeperOnly(awayText);
        const side: PbpRow["side"] =
          scoredBy ?? (homeMain && !awayMain ? "home" : awayMain && !homeMain ? "away" : homeMain ? "home" : null);
        const actorText = side === "away" ? awayText : side === "home" ? homeText : homeText || awayText;
        const actor = splitActor(actorText);
        const type = classify(actor.action || actorText);
        // "경기종료"는 시계가 00:00으로 찍혀 나온다 → 직전 행의 분을 이어 쓴다
        const minute = /경기종료/.test(actorText)
          ? (rows[rows.length - 1]?.minute ?? halfOffset(half))
          : halfOffset(half) + Number(cm[1]);

        rows.push({
          half,
          seq,
          clock: `${cm[1].padStart(2, "0")}:${cm[2]}`,
          minute,
          homeText,
          awayText,
          scoreHome,
          scoreAway,
          scoredBy,
          side: type === "period" ? null : side,
          type,
          ...actor,
        });
      });
  });

  return { rows, started, finished };
}

/** 행 식별용 키. 경기 중 행이 끼워 넣어지거나 정정돼도 같은 행은 같은 키가 된다 */
export function pbpRowKey(r: Pick<PbpRow, "half" | "clock" | "homeText" | "awayText">): string {
  return `${r.half}|${r.clock}|${r.homeText}|${r.awayText}`;
}
