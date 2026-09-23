export interface WidgetTeam {
  name: string;
  shortName: string; // 위젯 좁은 폭용 ("인천도시공사" → "인천")
  logoUrl: string | null;
}

export interface WidgetResponse {
  /** 위젯이 그대로 상태 분기에 쓴다 */
  state: "pre" | "live" | "finished" | "next";

  matchSeq: number | null;
  startsAt: string | null; // ISO 8601
  dateLabel: string | null; // "11.14 (토)"
  timeLabel: string | null; // "14:00"
  ddayLabel: string | null; // "D-6" (state가 next일 때)

  // 비시즌처럼 다음 경기가 없으면 null
  home: WidgetTeam | null;
  away: WidgetTeam | null;

  scoreHome: number | null;
  scoreAway: number | null;
  minuteLabel: string | null; // "전반 18'" (live일 때)
  venue: string | null;

  /** 위젯이 다음 갱신을 언제 예약할지. ISO 8601 */
  nextRefreshAt: string;
}
