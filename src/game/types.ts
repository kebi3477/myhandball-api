export interface GameTeam {
  name: string;
  logoUrl: string | null;
}

export interface TeamStatLine {
  // 슛 성공률: "totalShots" | "shots6m" | "shotsWing" | "shots9m" | "shots7m" | "shotsFast"
  // 약어 기록: "assists" | "turnovers" | "steals" | "blocks" | "yellowCards" | "twoMinutes" | "redCards" | "blueCards"
  key: string;
  label: string; // 한국어 표시명 (예: "슛 성공률", "어시스트")
  home: number;
  away: number;
  unit: "count" | "percent";
}

export interface PlayerGameRecord {
  number: number | null; // 배번
  name: string;
  position: "field" | "goalkeeper";
  goals: number; // 득점
  shots: number; // 슛 시도
  fieldGoals: number;
  fieldShots: number;
  shots6m: string; // "2/4" 원본 유지 (세부는 아래 숫자 필드로)
  goals6m: number;
  attempts6m: number;
  goalsWing: number;
  attemptsWing: number;
  goals9m: number;
  attempts9m: number;
  goals7m: number;
  attempts7m: number;
  goalsFast: number; // 속공
  attemptsFast: number;
  goalsBreakthrough: number; // 돌파
  attemptsBreakthrough: number;
  assists: number;
  turnovers: number;
  steals: number;
  blocks: number;
  saves: number | null; // 골키퍼만. 필드 선수는 null
  shotsFaced: number | null; // 골키퍼만. 필드 선수는 null
  playTime: string | null; // "58:20" (분:초). 출전하지 않았으면 null
}

export interface GameDetailResponse {
  url: string;
  matchSeq: number;
  dateLabel: string; // "2025.11.15 (토) 15:20"
  startsAt: string | null; // ISO 8601
  venue: string | null;

  home: GameTeam;
  away: GameTeam;

  scoreHome: number | null;
  scoreAway: number | null;

  // 원본 라벨은 "전반전1" / "후반전2"
  firstHalfHome: number | null;
  firstHalfAway: number | null;
  secondHalfHome: number | null;
  secondHalfAway: number | null;

  stats: TeamStatLine[];

  players: {
    home: PlayerGameRecord[];
    away: PlayerGameRecord[];
  };
}
