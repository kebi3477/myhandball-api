export type MatchStatus = "pre" | "live" | "finished";

export type LiveEventType =
  | "goal"
  | "shot"
  | "save"
  | "twoMinutes"
  | "yellowCard"
  | "redCard"
  | "blueCard"
  | "timeout"
  | "period"
  | "other";

export interface LiveEventItem {
  minute: number; // 경기 전체 기준 경과 분 (원본 경기 시계 기준)
  scoreHome: number; // 이 이벤트 시점의 누적 스코어
  scoreAway: number;
  scoredBy: "home" | "away" | null;
  observedAt: string | null; // 폴링으로 처음 본 시각. 종료 후 한꺼번에 받은 기록은 null

  half: number; // 1 전반, 2 후반, 3~ 연장
  clock: string; // 하프 기준 경기 시계 "29:53"
  type: LiveEventType;
  side: "home" | "away" | null;
  playerNumber: number | null;
  playerName: string | null;
  action: string; // 원문 행동 ("속공 GOAL", "2Min 파울")
  assistNumber: number | null;
  assistName: string | null;
}

export interface GameLiveResponse {
  matchSeq: number;
  status: MatchStatus;
  scoreHome: number | null;
  scoreAway: number | null;
  startsAt: string | null;
  lastChangeAt: string | null;

  /** "polling": 경기 중 폴링으로 쌓는 중, "final": 경기 종료 후 확정 기록 */
  source: "polling" | "final";

  events: LiveEventItem[]; // 최신순
}
