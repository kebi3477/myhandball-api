import { Injectable, Logger } from "@nestjs/common";
import { currentSeason } from "../common/season";
import { ScheduleService } from "../schedule/schedule.service";
import type { Gender } from "../team/types";

export interface SeasonResponse {
  season: string; // 지금 기준 시즌 (시작 연도)
  gender: Gender;
  opensAt: string | null; // 개막일(첫 경기). 모르면 null
  closesAt: string | null; // 종료일(마지막 경기, 포스트시즌 포함). 모르면 null
  isOffseason: boolean; // 지금이 시즌 밖인지
  nextSeason: string; // 다음에 개막할 시즌
  nextOpensAt: string | null; // 다음 시즌 개막일. 모르면 null (추정하지 않는다)
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * 시즌 기간. 일정이 있으면 일정의 첫·마지막 경기로 정하고, 일정이 아직 없으면
 * 연맹 공지로 확인해 넣은 환경변수 SEASON_OPENS_AT_{M|W}="<시즌>=<ISO 시각>"을 쓴다.
 * 어느 쪽도 없으면 null — 날짜를 추정하지 않는다 (카운트다운이 틀린 채로 떠 있게 된다)
 */
@Injectable()
export class SeasonService {
  private readonly logger = new Logger(SeasonService.name);

  constructor(private readonly scheduleService: ScheduleService) {}

  /** 일정의 첫·마지막 경기 시각 (정규·포스트시즌 전체) */
  private async range(season: string, gender: Gender): Promise<{ first: string | null; last: string | null }> {
    const starts: string[] = [];
    for (const type of ["1", "2"]) {
      const res = await this.scheduleService.fetchSchedule(gender, season, type, "");
      for (const g of res.days.flatMap((d) => d.games)) if (g.startsAt) starts.push(g.startsAt);
    }
    starts.sort((a, b) => Date.parse(a) - Date.parse(b));
    return { first: starts[0] ?? null, last: starts[starts.length - 1] ?? null };
  }

  /** 환경변수에 넣어 둔 개막일. 형식: "2026=2026-11-14T14:00:00+09:00". 시즌이 다르면 쓰지 않는다 */
  private announcedOpening(season: string, gender: Gender): string | null {
    const raw = process.env[`SEASON_OPENS_AT_${gender}`]?.trim();
    if (!raw) return null;
    const m = raw.match(/^(\d{4})=(.+)$/);
    if (!m || !ISO_RE.test(m[2]) || Number.isNaN(Date.parse(m[2]))) {
      this.logger.warn(`SEASON_OPENS_AT_${gender} 형식 오류 ("<시즌>=<ISO 시각>"이어야 함): "${raw}"`);
      return null;
    }
    return m[1] === season ? m[2] : null;
  }

  /** 일정이 있으면 일정, 없으면 공지된 개막일 */
  private async openingOf(season: string, gender: Gender): Promise<{ opensAt: string | null; closesAt: string | null }> {
    const { first, last } = await this.range(season, gender);
    const announced = this.announcedOpening(season, gender);
    if (first && announced && Date.parse(first) !== Date.parse(announced)) {
      this.logger.warn(`${season} ${gender} 개막일: 일정(${first})과 환경변수(${announced})가 다름 — 일정을 쓴다`);
    }
    return { opensAt: first ?? announced, closesAt: last };
  }

  async get(gender: Gender, now = Date.now()): Promise<SeasonResponse> {
    const season = currentSeason(now);
    const { opensAt, closesAt } = await this.openingOf(season, gender);

    const notStarted = !opensAt || now < Date.parse(opensAt);
    const nextSeason = opensAt && now < Date.parse(opensAt) ? season : String(Number(season) + 1);
    const nextOpensAt = nextSeason === season ? opensAt : (await this.openingOf(nextSeason, gender)).opensAt;

    // 시즌 중 = 개막 이후이고, 마지막 경기 날이 끝나기 전. 고정된 시즌(CURRENT_SEASON)이 지났어도
    // 다음 시즌이 이미 개막했으면 시즌 중으로 본다
    const endOfLastDay = closesAt ? Date.parse(closesAt.slice(0, 10) + "T23:59:59+09:00") : null;
    const inCurrent = !notStarted && (endOfLastDay === null || now <= endOfLastDay);
    const nextStarted = nextSeason !== season && !!nextOpensAt && now >= Date.parse(nextOpensAt);
    return {
      season,
      gender,
      opensAt,
      closesAt,
      isOffseason: !(inCurrent || nextStarted),
      nextSeason,
      nextOpensAt,
    };
  }
}
