export interface TeamInfo {
  name: string;           // 예: '서울시청'
  logoUrl: string | null; // 절대 URL
}

export interface LiveLink {
  provider: string; // 예: "naver", "daum", "etc"
  url: string;      // 절대 URL
}

export interface GameItem {
  home: TeamInfo;
  away: TeamInfo;
  scoreText: string | null; // 예: "- : -"
  time: string | null;      // 예: "16:15"
  broadcast: string[];      // 예: ["MAXPORTS","NAVER","다음"]
  liveLinks: LiveLink[];    // 예: [{ provider: "naver", url: "https://..." }]
  venue: string | null;     // 예: "광명 시민체육관"
  containerId: string | null; // ul id (예: m1768057200). 숫자는 경기일 00:00 KST epoch
  matchSeq: number | null;    // detail.php?match_seq= 값
  startsAt: string | null;    // 경기 시작 ISO 8601 (예: "2025-11-15T15:20:00+09:00")
}

export interface DayBlock {
  dateLabel: string;     // "2026.01.11 (일)" (원문)
  dateISO: string | null; // "2026-01-11"
  games: GameItem[];
}

export interface ScheduleResponse {
  url: string;
  leagueGender: "W" | "M" | "";
  leagueSeason: string;  // "2025"
  leagueType: string;    // "1"
  leagueMonth: string;
  days: DayBlock[];
}
