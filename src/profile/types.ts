import type { Gender } from "../team/types";

export interface UpsertProfileBody {
  nickname: string;
  teamNum: number; // 응원팀. /api/team 의 teamNum
  gender: Gender; // 응원팀이 속한 부
}

export interface ProfileResponse {
  nickname: string;
  teamNum: number;
  teamName: string; // /api/team 기준 정본 이름
  teamLogoUrl: string | null;
  gender: Gender;
  createdAt: string; // ISO 8601
  updatedAt: string;
}
