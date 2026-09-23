export type Gender = "W" | "M";

export interface TeamItem {
  teamNum: number;
  name: string;
  logoUrl: string | null;
  href: string | null;
}

export interface TeamListResponse {
  url: string;
  gender: Gender;
  teams: TeamItem[];
}

export interface CoachItem {
  name: string;
  role: string; // "감독" | "코치" | "플레잉코치" | "트레이너" | "팀매니저" | "통역" 등 원본 그대로
  photoUrl: string | null;
}

export interface TeamSquadPlayer {
  playerSeq: number | null;
  name: string;
  number: number | null;
  position: string | null;
  photoUrl: string | null;
}

export interface TeamHistoryItem {
  year: string; // "2016-2017" | "2022"
  text: string; // 줄바꿈 유지
}

/** "팀기록" 탭의 시즌별 팀 누적 기록 */
export interface TeamSeasonRecord {
  season: string; // "2025-2026"
  postseason: boolean; // 원본 라벨 "챔피언결정전"
  goals: number;
  goals6m: number;
  goalsWing: number;
  goals9m: number;
  goals7m: number;
  goalsFast: number;
  goalsBreakthrough: number;
  assists: number;
  turnovers: number;
  steals: number;
  blocks: number;
  yellowCards: number;
  twoMinutes: number;
  redCards: number;
}

export interface TeamDetailResponse {
  url: string;
  teamNum: number;
  name: string;
  gender: Gender;
  logoUrl: string | null;

  intro: string | null; // 소개 본문 (줄바꿈 유지)
  foundedYear: number | null; // 본문 "2016년 2월에 창단" → 2016. 못 찾으면 null
  homeTown: string | null; // 본문 "청주시를 연고로" → "청주시". 못 찾으면 null
  homeStadium: string | null; // 원본에 없음. 항상 null
  address: string | null; // 원본의 자리표시 주소는 null로 거른다
  snsUrl: string | null;
  history: TeamHistoryItem[];

  coaches: CoachItem[];
  squad: TeamSquadPlayer[];
  seasonRecords: TeamSeasonRecord[];

  // /api/ranking 재사용
  rank: number | null;
  points: number | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;

  // 시즌 경기 결과 시간순 (앱이 누적 승점으로 추이 그래프를 그린다)
  results: ("W" | "D" | "L")[];
}
