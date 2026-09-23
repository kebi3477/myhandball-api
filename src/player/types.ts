import type { Gender } from "../team/types";

export type PlayerPosition = "LW" | "RW" | "LB" | "RB" | "CB" | "PV" | "GK" | string;

/** 목록·랭킹·상세 공통으로 쓰는 시즌(또는 통산) 기록 */
export interface PlayerSeasonStats {
  games: number | null; // 원본 목록·랭킹 페이지에는 경기 수가 없어 null. 상세에서만 채워진다
  goals: number;
  shots: number;
  goalRate: number | null; // 63.12 (퍼센트). 슛 시도가 없으면 null
  fieldGoals: number;
  fieldShots: number;
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
  blocks: number;
  steals: number;
  turnovers: number;
  saves: number | null; // 골키퍼만. 필드 선수는 null
  shotsFaced: number | null;
  saveRate: number | null; // 방어율 (퍼센트)
  playTime: string | null; // "7189:51" (총 분:초)
}

export interface PlayerItem {
  playerSeq: number | null; // player_detail.php?player_seq=
  name: string;
  number: number | null;
  position: PlayerPosition | null;
  teamName: string; // 전체 이름 ("인천" → "인천도시공사"). 매핑 실패 시 원본
  teamNum: number | null;
  teamLogoUrl: string | null;
  photoUrl: string | null;
  rank: number | null; // 해당 카테고리 순위 (목록에서는 원본 표의 NO = 득점 순위)
  stats: PlayerSeasonStats;
}

export interface PlayerListResponse {
  url: string;
  gender: Gender;
  season: string;
  type: string;
  players: PlayerItem[];
}

export interface PlayerDetailResponse {
  url: string;
  playerSeq: number;
  name: string;
  nameEn: string | null; // "JIHOON KIM"
  number: number | null;
  position: PlayerPosition | null;
  teamName: string;
  teamNum: number | null;
  teamLogoUrl: string | null;
  photoUrl: string | null;

  birthDate: string | null; // ISO "1997-02-03"
  birthLabel: string | null; // "1997년 2월 3일"
  heightCm: number | null;
  weightKg: number | null;
  school: string | null;

  careerStats: PlayerSeasonStats; // 정규리그 통산
  seasonStats: {
    season: string; // "2025-2026"
    postseason: boolean;
    stats: PlayerSeasonStats;
  }[];
}

export const STAT_CATEGORIES = [
  "goals",
  "fieldGoals",
  "assists",
  "saves",
  "fieldSaves",
  "saveRate",
  "wingGoals",
  "breakthroughGoals",
  "fastGoals",
  "goals7m",
  "saves7m",
  "blocks",
  "steals",
  "attackPoints",
] as const;

export type StatCategory = (typeof STAT_CATEGORIES)[number];

export interface PlayerRankingResponse {
  url: string;
  gender: Gender;
  season: string;
  type: string;
  category: StatCategory;
  unit: string; // "골" | "개" | "회" | "%" | "P" (원본 표기)
  items: (PlayerItem & { value: number | null })[]; // value: 해당 카테고리 수치 (원본)
}
