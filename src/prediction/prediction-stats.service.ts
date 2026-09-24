import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";
import { Prediction } from "../engagement/prediction.entity";
import type { PredictionPick } from "../engagement/types";
import { Profile } from "../profile/profile.entity";
import { ScheduleService } from "../schedule/schedule.service";
import { TeamService } from "../team/team.service";
import type { Gender, TeamItem } from "../team/types";
import type {
  FandomResponse,
  LeaderboardResponse,
  LeaderboardRow,
  MyPredictionsResponse,
  PredictionWeekGame,
  PredictionWeekResponse,
} from "./types";

/** 랭킹에 오르려면 확정된 예측이 이 수 이상이어야 한다 */
export const MIN_SETTLED = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const PICKS: PredictionPick[] = ["home", "draw", "away"];
const norm = (s: string) => s.replace(/\s+/g, "");

/** 0~100, 소수점 첫째 자리 반올림 */
const rateOf = (hits: number, settled: number) => (settled ? Math.round((hits / settled) * 1000) / 10 : 0);

@Injectable()
export class PredictionStatsService {
  constructor(
    @InjectRepository(Prediction) private readonly predictions: Repository<Prediction>,
    @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
    private readonly dataSource: DataSource,
    private readonly scheduleService: ScheduleService,
    private readonly teamService: TeamService,
  ) {}

  private async teamsOf(genders: Gender[]): Promise<Map<string, TeamItem & { gender: Gender }>> {
    const out = new Map<string, TeamItem & { gender: Gender }>();
    for (const g of genders) {
      for (const t of (await this.teamService.fetchTeams(g)).teams) out.set(`${g}:${t.teamNum}`, { ...t, gender: g });
    }
    return out;
  }

  // ---------- B-2 이번 주 예측 묶음 ----------

  async week(
    genders: Gender[],
    season: string,
    types: string[],
    days: number,
    deviceId: string | null,
  ): Promise<PredictionWeekResponse> {
    const now = Date.now();
    const until = now + days * DAY_MS;
    const teams = await this.teamsOf(genders);
    const logoOf = (g: Gender, name: string) =>
      [...teams.values()].find((t) => t.gender === g && norm(t.name) === norm(name))?.logoUrl ?? null;

    const games: Omit<PredictionWeekGame, "myPick" | "total" | "home" | "draw" | "away">[] = [];
    for (const gender of genders) {
      for (const type of types) {
        const res = await this.scheduleService.fetchSchedule(gender, season, type, "");
        for (const g of res.days.flatMap((d) => d.games)) {
          if (g.matchSeq === null || !g.startsAt) continue;
          const start = Date.parse(g.startsAt);
          if (start <= now || start > until) continue; // 아직 시작 안 한, N일 안의 경기만
          games.push({
            matchSeq: g.matchSeq,
            gender,
            homeName: g.home.name,
            awayName: g.away.name,
            homeLogoUrl: logoOf(gender, g.home.name) ?? g.home.logoUrl,
            awayLogoUrl: logoOf(gender, g.away.name) ?? g.away.logoUrl,
            startsAt: g.startsAt,
            venue: g.venue,
            open: start > now,
          });
        }
      }
    }
    games.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

    const seqs = games.map((g) => g.matchSeq);
    const counts = seqs.length
      ? await this.predictions
          .createQueryBuilder("p")
          .select("p.match_seq", "matchSeq")
          .addSelect("p.pick", "pick")
          .addSelect("COUNT(*)::int", "n")
          .where("p.match_seq IN (:...seqs)", { seqs })
          .groupBy("p.match_seq")
          .addGroupBy("p.pick")
          .getRawMany<{ matchSeq: number; pick: PredictionPick; n: number }>()
      : [];
    const mine =
      deviceId && seqs.length ? await this.predictions.find({ where: { deviceId, matchSeq: In(seqs) } }) : [];
    const myPick = new Map(mine.map((p) => [p.matchSeq, p.pick]));

    return {
      season,
      games: games.map((g) => {
        const c = Object.fromEntries(
          PICKS.map((k) => [k, counts.find((r) => r.matchSeq === g.matchSeq && r.pick === k)?.n ?? 0]),
        ) as Record<PredictionPick, number>;
        return { ...g, myPick: myPick.get(g.matchSeq) ?? null, total: c.home + c.draw + c.away, ...c };
      }),
    };
  }

  // ---------- 공통: 시즌별 기기 적중 통계 ----------

  private async deviceStats(season: string): Promise<{ deviceId: string; settled: number; hits: number }[]> {
    const rows: { device_id: string; settled: number; hits: number }[] = await this.dataSource.query(
      `SELECT p.device_id,
              COUNT(*) FILTER (WHERE p.settled)::int AS settled,
              COUNT(*) FILTER (WHERE p.settled AND p.hit)::int AS hits
         FROM predictions p JOIN match_meta m ON m.match_seq = p.match_seq
        WHERE m.season = $1
        GROUP BY p.device_id`,
      [season],
    );
    return rows.map((r) => ({ deviceId: r.device_id, settled: r.settled, hits: r.hits }));
  }

  // ---------- B-3 적중률 랭킹 ----------

  async leaderboard(
    season: string,
    scope: "all" | "team",
    teamNum: number | null,
    limit: number,
    deviceId: string | null,
  ): Promise<LeaderboardResponse> {
    const stats = await this.deviceStats(season);
    const teams = await this.teamsOf(["M", "W"]);

    // 전체 순위를 먼저 만든다. 팀 범위는 여기서 거르고, 내 상위 %는 범위와 상관없이 전체 기준이다
    const everyone = await this.rankedQualified(stats);
    const qualified = scope === "team" ? everyone.filter(({ p }) => p.teamNum === teamNum) : everyone;

    const toRow = (i: number): LeaderboardRow => {
      const { p, s } = qualified[i];
      const team = teams.get(`${p.gender}:${p.teamNum}`);
      return {
        // 같은 순위를 주지 않는다 (정렬 후 인덱스 + 1)
        rank: i + 1,
        nickname: p.nickname,
        teamNum: p.teamNum,
        teamName: team?.name ?? "",
        teamLogoUrl: team?.logoUrl ?? null,
        settled: s.settled,
        hits: s.hits,
        rate: rateOf(s.hits, s.settled),
        isMe: !!deviceId && p.deviceId === deviceId,
      };
    };
    const rows = qualified.slice(0, limit).map((_, i) => toRow(i));

    let me: LeaderboardRow | null = null;
    let meHint: string | null = null;
    let meTopPercent: number | null = null;
    if (deviceId) {
      const myIndex = qualified.findIndex(({ p }) => p.deviceId === deviceId);
      const myOverall = everyone.findIndex(({ p }) => p.deviceId === deviceId);
      // 상위 % = max(1, ceil(전체 순위 / 전체 인원 × 100)). 범위가 '내 팀 팬'이어도 전체 기준
      if (myOverall >= 0) meTopPercent = Math.max(1, Math.ceil(((myOverall + 1) / everyone.length) * 100));
      if (myIndex >= 0) {
        me = toRow(myIndex);
      } else {
        const myProfile = await this.profiles.findOne({ where: { deviceId } });
        const mySettled = stats.find((x) => x.deviceId === deviceId)?.settled ?? 0;
        if (!myProfile) meHint = "닉네임을 정하면 랭킹에 참여할 수 있어요";
        else if (scope === "team" && myProfile.teamNum !== teamNum) meHint = "이 랭킹은 해당 팀을 응원팀으로 고른 사람만 올라가요";
        else meHint = `확정 ${MIN_SETTLED - mySettled}경기 더 참여하면 랭킹에 올라가요`;
      }
    }

    return { season, scope, minSettled: MIN_SETTLED, total: qualified.length, rows, me, meHint, meTopPercent };
  }

  /**
   * 랭킹 대상자(프로필 있음 + 확정 MIN_SETTLED경기 이상)를 순위 순으로.
   * 정렬: 적중률(반올림 전 비율) 내림차순 → 확정 경기 수 내림차순 → 프로필 생성 시각 오름차순(먼저 참여한 사람이 위).
   * 세 번째 기준이 없으면 동률끼리 요청마다 순서가 흔들린다
   */
  private async rankedQualified(stats: { deviceId: string; settled: number; hits: number }[]) {
    const byDevice = new Map(stats.map((s) => [s.deviceId, s]));
    const profiles = await this.profiles.find();
    return profiles
      .map((p) => ({ p, s: byDevice.get(p.deviceId) ?? { settled: 0, hits: 0 } }))
      .filter(({ s }) => s.settled >= MIN_SETTLED)
      .sort(
        (a, b) =>
          b.s.hits * a.s.settled - a.s.hits * b.s.settled || // 적중률 비교를 나눗셈 없이 (정확한 동률 판정)
          b.s.settled - a.s.settled ||
          a.p.createdAt.getTime() - b.p.createdAt.getTime() ||
          a.p.id - b.p.id,
      );
  }

  // ---------- B-4 팬덤 적중률 ----------

  async fandom(gender: Gender, season: string): Promise<FandomResponse> {
    // 팀 적중률 = 그 팀 팬들의 적중 합 / 확정 경기 합 (경기 수 가중). 사용자별 적중률의 평균이 아니다.
    // 분모에는 랭킹 대상자(프로필 + 확정 MIN_SETTLED경기 이상)만 들어간다
    const ranked = await this.rankedQualified(await this.deviceStats(season));
    const teams = (await this.teamService.fetchTeams(gender)).teams;

    // 팬이 없는 팀도 rate 0, fans 0으로 남긴다
    const agg = teams.map((t) => {
      const fans = ranked.filter(({ p }) => p.gender === gender && p.teamNum === t.teamNum);
      return {
        t,
        fans: fans.length,
        settled: fans.reduce((n, { s }) => n + s.settled, 0),
        hits: fans.reduce((n, { s }) => n + s.hits, 0),
      };
    });
    // 적중률 내림차순 → 확정 경기 합 내림차순 → teamNum (순서 고정). 팬이 없는 팀은 적중률 0
    const ratio = (x: { hits: number; settled: number }) => (x.settled ? x.hits / x.settled : 0);
    agg.sort((a, b) => ratio(b) - ratio(a) || b.settled - a.settled || a.t.teamNum - b.t.teamNum);
    return {
      season,
      gender,
      items: agg.map((a, i) => ({
        rank: i + 1,
        teamNum: a.t.teamNum,
        teamName: a.t.name,
        teamLogoUrl: a.t.logoUrl,
        fans: a.fans,
        settled: a.settled,
        hits: a.hits,
        rate: rateOf(a.hits, a.settled),
      })),
    };
  }

  // ---------- B-5 내 예측 목록 ----------

  async my(deviceId: string, season: string, limit: number): Promise<MyPredictionsResponse> {
    const [agg]: { count: number; settled: number; hits: number }[] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE p.settled)::int AS settled,
              COUNT(*) FILTER (WHERE p.settled AND p.hit)::int AS hits
         FROM predictions p JOIN match_meta m ON m.match_seq = p.match_seq
        WHERE p.device_id = $1 AND m.season = $2`,
      [deviceId, season],
    );
    const rows: {
      match_seq: number;
      pick: PredictionPick;
      settled: boolean;
      hit: boolean;
      home_name: string;
      away_name: string;
      starts_at: Date | null;
      score_home: number | null;
      score_away: number | null;
    }[] = await this.dataSource.query(
      `SELECT p.match_seq, p.pick, p.settled, p.hit, m.home_name, m.away_name, m.starts_at, m.score_home, m.score_away
         FROM predictions p JOIN match_meta m ON m.match_seq = p.match_seq
        WHERE p.device_id = $1 AND m.season = $2
        ORDER BY m.starts_at DESC NULLS LAST, p.match_seq DESC
        LIMIT $3`,
      [deviceId, season, limit],
    );
    return {
      season,
      count: agg.count,
      settled: agg.settled,
      hits: agg.hits,
      rate: rateOf(agg.hits, agg.settled),
      items: rows.map((r) => ({
        matchSeq: r.match_seq,
        homeName: r.home_name,
        awayName: r.away_name,
        startsAt: r.starts_at ? new Date(r.starts_at).toISOString() : "",
        pick: r.pick,
        settled: r.settled,
        hit: r.settled && r.hit,
        scoreText: r.settled && r.score_home !== null && r.score_away !== null ? `${r.score_home} : ${r.score_away}` : null,
      })),
    };
  }
}
