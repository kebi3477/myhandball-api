import type { PredictionPick } from "../engagement/types";
import type { Gender } from "../team/types";

export interface PredictionWeekGame {
  matchSeq: number;
  gender: Gender;
  homeName: string; // /api/team 정본 이름
  awayName: string;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
  startsAt: string; // ISO 8601 (+09:00)
  venue: string | null;
  open: boolean; // 아직 예측을 받는지 (= 시작 전)
  myPick: PredictionPick | null; // X-Device-Id 기준
  total: number;
  home: number;
  draw: number;
  away: number;
}

export interface PredictionWeekResponse {
  season: string;
  games: PredictionWeekGame[];
}

export interface LeaderboardRow {
  rank: number;
  nickname: string;
  teamNum: number;
  teamName: string;
  teamLogoUrl: string | null;
  settled: number; // 확정된 참여 수
  hits: number;
  rate: number; // 0~100, 소수점 첫째 자리 반올림
  isMe: boolean;
}

export interface LeaderboardResponse {
  season: string;
  scope: "all" | "team";
  minSettled: number;
  total: number; // 조건을 만족하는 전체 참여자 수
  rows: LeaderboardRow[];
  me: LeaderboardRow | null;
  meHint: string | null; // me가 null인 이유 (앱이 그대로 띄운다)
}

export interface FandomRow {
  rank: number;
  teamNum: number;
  teamName: string;
  teamLogoUrl: string | null;
  fans: number; // 확정 참여가 1회 이상인 팬 수
  settled: number; // 팬들의 확정 참여 합계
  hits: number;
  rate: number; // 0~100
}

export interface FandomResponse {
  season: string;
  gender: Gender;
  items: FandomRow[]; // rate 내림차순
}

export interface MyPredictionItem {
  matchSeq: number;
  homeName: string;
  awayName: string;
  startsAt: string;
  pick: PredictionPick;
  settled: boolean;
  hit: boolean;
  scoreText: string | null; // "28 : 26". 미확정이면 null
}

export interface MyPredictionsResponse {
  season: string;
  count: number; // 참여 전체
  settled: number; // 적중 여부가 정해진 것
  hits: number;
  rate: number; // 0~100. settled가 0이면 0
  items: MyPredictionItem[]; // startsAt 내림차순
}
