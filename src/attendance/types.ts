export interface AttendanceItem {
  matchSeq: number;
  attendedAt: string; // 기록한 시각 (ISO 8601)
}

export interface AttendanceResponse {
  season: string;
  items: AttendanceItem[]; // attendedAt 내림차순
}
