import type { Gender } from "../team/types";

export type TeamRecordItem = {
  rank: number; // 원본 표의 순위 (정규리그 순위와 같다)
  team: { name: string; logoUrl: string | null }; // name은 TeamService.canonicalNames()로 통일 ("상무 피닉스" → "상무피닉스")
  goals: number; // 득점
  fieldGoals: number; // 필드 득점
  goals6m: number; // 6M
  goalsWing: number; // 윙
  goals9m: number; // 9M
  goals7m: number; // 7M 득점
  drawn7m: number; // E7 = 7m드로 획득 수
  goalsFast: number; // 속공
  goalsBreakthrough: number; // 돌파
  assists: number; // 도움
  passClearChances: number; // PC
  turnovers: number; // 실책
  steals: number; // 스틸
  blocks: number; // 블록샷
  personalFouls: number; // PF
  saves: number; // 세이브 (GK)
  fieldSaves: number; // 필드 세이브
  yellowCards: number; // 경고
  twoMinutes: number; // 2Min
  redCards: number; // 실격
  reports: number; // 보고서
};

export type TeamRecordStatKey = Exclude<keyof TeamRecordItem, "rank" | "team">;

export type TeamRecordsResponse = {
  url: string;
  leagueGender: Gender;
  leagueSeason: string;
  leagueType: string;
  items: TeamRecordItem[]; // 원본 순위 순서. 시즌 시작 전이면 빈 배열 (오류 아님)
};
