import type { Gender } from "../team/types";

export type PushKind = "start" | "goal" | "end";

export interface PushRegisterRequest {
  token: string; // FCM 토큰
  platform: "ios" | "android";
  teamNum: number | null; // 마이팀. null이면 팀 알림 없음
  gender: Gender;
}

export interface PushRegisterResponse {
  ok: true;
  platform: "ios" | "android";
  teamNum: number | null;
  gender: Gender;
  enabled: boolean;
}

/** 폴러가 알림을 요청할 때 넘기는 경기 정보 */
export interface PushMatch {
  matchSeq: number;
  homeName: string;
  awayName: string;
}
