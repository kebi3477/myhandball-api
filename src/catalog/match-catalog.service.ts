import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { currentSeason, seasonOfDate } from "../common/season";
import { GameService } from "../game/game.service";
import { computeStatus } from "../live/match-status";
import { ScheduleService } from "../schedule/schedule.service";
import type { GameItem } from "../schedule/types";
import { TeamService } from "../team/team.service";
import type { Gender } from "../team/types";
import { MatchMeta, MatchResult } from "./match-meta.entity";

const GENDERS: Gender[] = ["M", "W"];
const LEAGUE_TYPES = ["1", "2"];
const norm = (s: string) => s.replace(/\s+/g, "");

function resultOf(scoreHome: number | null, scoreAway: number | null): MatchResult | null {
  if (scoreHome === null || scoreAway === null) return null;
  return scoreHome > scoreAway ? "home" : scoreHome < scoreAway ? "away" : "draw";
}

/**
 * 경기 카탈로그(match_meta)를 채우고, 결과가 확정된 경기의 예측에 적중 여부를 기록한다.
 * - 기동 시·30분마다·폴러가 경기 종료를 감지할 때 현재 시즌을 동기화 → 판정
 * - 기동 시 카탈로그에 없는 경기의 예측·직관은 상세에서 채워 소급 판정한다
 */
@Injectable()
export class MatchCatalogService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MatchCatalogService.name);

  constructor(
    @InjectRepository(MatchMeta) private readonly metas: Repository<MatchMeta>,
    private readonly dataSource: DataSource,
    private readonly scheduleService: ScheduleService,
    private readonly gameService: GameService,
    private readonly teamService: TeamService,
  ) {}

  onApplicationBootstrap() {
    void this.bootstrapSync();
  }

  private async bootstrapSync() {
    try {
      await this.syncSeason(currentSeason());
      await this.backfillOrphans();
    } catch (e) {
      this.logger.error(`기동 시 경기 카탈로그 동기화 실패: ${e}`);
    }
  }

  @Cron("*/30 * * * *")
  async scheduledSync() {
    try {
      await this.syncSeason(currentSeason());
    } catch (e) {
      this.logger.warn(`경기 카탈로그 정기 동기화 실패: ${e}`);
    }
  }

  private fromGame(g: GameItem, season: string, gender: Gender, leagueType: string): Partial<MatchMeta> {
    const finished = g.status === "finished";
    return {
      matchSeq: g.matchSeq!,
      season,
      gender,
      leagueType,
      startsAt: g.startsAt ? new Date(g.startsAt) : null,
      homeName: g.home.name,
      awayName: g.away.name,
      homeLogoUrl: g.home.logoUrl,
      awayLogoUrl: g.away.logoUrl,
      venue: g.venue,
      scoreHome: g.scoreHome,
      scoreAway: g.scoreAway,
      result: finished ? resultOf(g.scoreHome, g.scoreAway) : null,
    };
  }

  /** 한 시즌의 일정 전체(남녀 × 정규·포스트)를 카탈로그에 반영하고 판정한다 */
  async syncSeason(season: string): Promise<{ matches: number; settled: number }> {
    const rows: Partial<MatchMeta>[] = [];
    for (const gender of GENDERS) {
      for (const type of LEAGUE_TYPES) {
        const res = await this.scheduleService.fetchSchedule(gender, season, type, "");
        for (const g of res.days.flatMap((d) => d.games)) {
          if (g.matchSeq !== null) rows.push(this.fromGame(g, season, gender, type));
        }
      }
    }
    if (rows.length) await this.metas.upsert(rows, ["matchSeq"]);
    const settled = await this.settle();
    if (settled) this.logger.log(`예측 ${settled}건 적중 판정 (시즌 ${season}, 경기 ${rows.length})`);
    return { matches: rows.length, settled };
  }

  /**
   * 결과가 확정된 경기의 미판정 예측에 settled·hit을 기록한다.
   * 결과가 없는 경기(연기·미기록)의 예측은 settled=false로 남아 분모에서 빠진다
   */
  async settle(): Promise<number> {
    // postgres 드라이버는 UPDATE 결과를 [rows, affected]로 돌려준다
    const res = await this.dataSource.query(
      `UPDATE predictions p SET settled = true, hit = (p.pick = m.result)
         FROM match_meta m
        WHERE m.match_seq = p.match_seq AND m.result IS NOT NULL AND p.settled = false`,
    );
    return Array.isArray(res) && typeof res[1] === "number" ? res[1] : 0;
  }

  /** 카탈로그에서 경기를 찾는다. 없으면 현재 시즌을 동기화하고, 그래도 없으면 경기 상세에서 채운다 */
  async ensure(matchSeq: number): Promise<MatchMeta | null> {
    const hit = await this.metas.findOne({ where: { matchSeq } });
    if (hit) return hit;
    await this.syncSeason(currentSeason()).catch((e) => this.logger.warn(`카탈로그 동기화 실패: ${e}`));
    return (await this.metas.findOne({ where: { matchSeq } })) ?? this.fromDetail(matchSeq);
  }

  /** 일정에 없는 경기(지난 시즌 등)를 경기 상세로 채운다 */
  private async fromDetail(matchSeq: number): Promise<MatchMeta | null> {
    const d = await this.gameService.fetchGame(matchSeq);
    if (!d.startsAt) return null;
    const start = new Date(d.startsAt);
    const season = seasonOfDate(start.getTime());
    let gender: Gender | null = null;
    for (const g of GENDERS) {
      const teams = (await this.teamService.fetchTeams(g)).teams;
      if (teams.some((t) => norm(t.name) === norm(d.home.name))) gender = g;
    }
    if (!gender) {
      this.logger.warn(`경기 ${matchSeq}의 부를 알 수 없어 카탈로그에 넣지 않음 (${d.home.name})`);
      return null;
    }
    const canonical = await this.teamService.canonicalNames([gender]);
    const finished =
      computeStatus({ startsAt: d.startsAt, hasFinalScore: d.scoreHome !== null }) === "finished";
    const meta = this.metas.create({
      matchSeq,
      season,
      gender,
      leagueType: null,
      startsAt: start,
      homeName: canonical(d.home.name),
      awayName: canonical(d.away.name),
      homeLogoUrl: d.home.logoUrl,
      awayLogoUrl: d.away.logoUrl,
      venue: d.venue,
      scoreHome: d.scoreHome,
      scoreAway: d.scoreAway,
      result: finished ? resultOf(d.scoreHome, d.scoreAway) : null,
    });
    await this.metas.upsert(meta, ["matchSeq"]);
    await this.settle();
    return meta;
  }

  /** 카탈로그에 없는 경기를 가리키는 예측·직관 기록을 채운다 (소급 판정) */
  private async backfillOrphans() {
    const rows: { match_seq: number }[] = await this.dataSource.query(
      `SELECT DISTINCT x.match_seq FROM (
         SELECT match_seq FROM predictions UNION SELECT match_seq FROM attendances
       ) x LEFT JOIN match_meta m ON m.match_seq = x.match_seq WHERE m.match_seq IS NULL LIMIT 500`,
    );
    for (const { match_seq } of rows) {
      await this.fromDetail(match_seq).catch((e) => this.logger.warn(`경기 ${match_seq} 소급 실패: ${e}`));
    }
    if (rows.length) this.logger.log(`카탈로그에 없던 경기 ${rows.length}건 소급 처리`);
  }
}
