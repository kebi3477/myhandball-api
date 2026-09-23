import { BadRequestException, ConflictException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { CacheService } from "../cache/cache.service";
import { GameService } from "../game/game.service";
import type { GameDetailResponse, PlayerGameRecord } from "../game/types";
import { MatchState } from "../live/match-state.entity";
import { computeStatus } from "../live/match-status";
import { PlayerService } from "../player/player.service";
import { TeamService } from "../team/team.service";
import type { Gender, TeamItem } from "../team/types";
import { MvpVote } from "./mvp-vote.entity";
import { Prediction } from "./prediction.entity";
import type { MvpCandidateItem, MvpResponse, PredictionPick, PredictionResponse } from "./types";

const PICKS: PredictionPick[] = ["home", "draw", "away"];
const MVP_CANDIDATES = 5;
const MVP_PLAYERS_TTL_SEC = 60 * 60 * 24;

/** 경기에 뛴 선수 (MVP 투표 대상). playerSeq는 로스터에서 찾은 값 */
interface GamePlayer {
  playerSeq: number | null;
  playerName: string;
  teamName: string;
  side: "home" | "away";
  number: number | null;
  goals: number;
  assists: number;
  saves: number | null;
  statLine: string;
}

function statLine(p: PlayerGameRecord): string {
  const parts = [`${p.goals}골`];
  if (p.assists) parts.push(`${p.assists}AS`);
  if (p.saves) parts.push(`${p.saves}세이브`);
  return parts.join(" ");
}

function isUniqueViolation(e: unknown) {
  return e instanceof QueryFailedError && (e as any).driverError?.code === "23505";
}

@Injectable()
export class GameEngagementService {
  private readonly logger = new Logger(GameEngagementService.name);

  constructor(
    @InjectRepository(Prediction) private readonly predictions: Repository<Prediction>,
    @InjectRepository(MvpVote) private readonly votes: Repository<MvpVote>,
    @InjectRepository(MatchState) private readonly states: Repository<MatchState>,
    private readonly gameService: GameService,
    private readonly playerService: PlayerService,
    private readonly teamService: TeamService,
    private readonly cache: CacheService,
  ) {}

  // ---------- 승부 예측 ----------

  /** 경기 시작 전까지만 열린다. 시작 시각을 모르면 닫힌 것으로 본다 */
  private predictionOpen(detail: GameDetailResponse) {
    return !!detail.startsAt && Date.now() < Date.parse(detail.startsAt);
  }

  async getPrediction(matchSeq: number, deviceId: string | null): Promise<PredictionResponse> {
    const detail = await this.gameService.fetchGame(matchSeq);
    const rows = await this.predictions
      .createQueryBuilder("p")
      .select("p.pick", "pick")
      .addSelect("COUNT(*)::int", "n")
      .where("p.match_seq = :matchSeq", { matchSeq })
      .groupBy("p.pick")
      .getRawMany<{ pick: PredictionPick; n: number }>();
    const counts = Object.fromEntries(PICKS.map((k) => [k, rows.find((r) => r.pick === k)?.n ?? 0])) as Record<
      PredictionPick,
      number
    >;
    const mine = deviceId ? await this.predictions.findOne({ where: { matchSeq, deviceId } }) : null;
    return {
      matchSeq,
      myPick: mine?.pick ?? null,
      total: counts.home + counts.draw + counts.away,
      ...counts,
      open: this.predictionOpen(detail),
    };
  }

  /** 같은 기기의 재투표는 덮어쓴다 (경기 시작 전까지) */
  async putPrediction(matchSeq: number, deviceId: string, pick: unknown): Promise<PredictionResponse> {
    if (!PICKS.includes(pick as PredictionPick)) {
      throw new BadRequestException("pick must be one of home, draw, away");
    }
    const detail = await this.gameService.fetchGame(matchSeq);
    if (!this.predictionOpen(detail)) throw new ConflictException("경기가 시작돼 예측할 수 없습니다");

    await this.predictions.upsert({ matchSeq, deviceId, pick: pick as PredictionPick }, ["matchSeq", "deviceId"]);
    return this.getPrediction(matchSeq, deviceId);
  }

  // ---------- MVP 투표 ----------

  /** 경기 종료 후에만 열린다 (04번 경기 상태 판정 기준) */
  private async mvpOpen(detail: GameDetailResponse) {
    const state = await this.states.findOne({ where: { matchSeq: detail.matchSeq } });
    return (
      computeStatus({ startsAt: detail.startsAt, hasFinalScore: detail.scoreHome !== null, state }) === "finished"
    );
  }

  /** 경기 기록의 선수 전원 + 로스터에서 찾은 playerSeq. 끝난 경기만 캐시한다 */
  private async gamePlayers(detail: GameDetailResponse, finished: boolean): Promise<GamePlayer[]> {
    const key = `mvp:players:${detail.matchSeq}`;
    const hit = await this.cache.getJSON<GamePlayer[]>(key);
    if (hit) return hit;

    const team = async (name: string): Promise<{ gender: Gender; team: TeamItem } | null> => {
      for (const g of ["M", "W"] as Gender[]) {
        const t = (await this.teamService.fetchTeams(g)).teams.find(
          (x) => x.name.replace(/\s+/g, "") === name.replace(/\s+/g, ""),
        );
        if (t) return { gender: g, team: t };
      }
      return null;
    };

    const out: GamePlayer[] = [];
    for (const side of ["home", "away"] as const) {
      const teamName = detail[side].name;
      const t = await team(teamName).catch(() => null);
      if (!t) this.logger.warn(`팀을 찾지 못해 playerSeq 없이 진행 (${teamName})`);
      for (const p of detail.players[side]) {
        const playerSeq = t
          ? await this.playerService.lookupPlayerSeq(t.gender, t.team.teamNum, p.name, p.number).catch(() => null)
          : null;
        out.push({
          playerSeq,
          playerName: p.name,
          teamName,
          side,
          number: p.number,
          goals: p.goals,
          assists: p.assists,
          saves: p.saves,
          statLine: statLine(p),
        });
      }
    }
    if (finished && out.length) await this.cache.setJSON(key, out, MVP_PLAYERS_TTL_SEC);
    return out;
  }

  async getMvp(matchSeq: number, deviceId: string | null): Promise<MvpResponse> {
    const detail = await this.gameService.fetchGame(matchSeq);
    const open = await this.mvpOpen(detail);
    const players = await this.gamePlayers(detail, open);

    const tally = await this.votes
      .createQueryBuilder("v")
      .select("v.player_seq", "playerSeq")
      .addSelect("v.player_name", "playerName")
      .addSelect("v.side", "side")
      .addSelect("COUNT(*)::int", "n")
      .where("v.match_seq = :matchSeq", { matchSeq })
      .groupBy("v.player_seq")
      .addGroupBy("v.player_name")
      .addGroupBy("v.side")
      .getRawMany<{ playerSeq: number | null; playerName: string; side: "home" | "away"; n: number }>();
    const votesOf = (p: Pick<GamePlayer, "playerName" | "side">) =>
      tally.filter((t) => t.playerName === p.playerName && t.side === p.side).reduce((s, t) => s + t.n, 0);

    // 후보: 득점 + 어시스트 상위 5명. 그 밖의 선수가 표를 받았으면 함께 보여준다
    const ranked = [...players].sort((a, b) => b.goals + b.assists - (a.goals + a.assists) || b.goals - a.goals);
    const top = ranked.slice(0, MVP_CANDIDATES);
    const extra = ranked.slice(MVP_CANDIDATES).filter((p) => votesOf(p) > 0);
    const candidates: MvpCandidateItem[] = [...top, ...extra]
      .map((p) => ({
        playerSeq: p.playerSeq,
        playerName: p.playerName,
        teamName: p.teamName,
        side: p.side,
        number: p.number,
        statLine: p.statLine,
        votes: votesOf(p),
      }))
      .sort((a, b) => b.votes - a.votes);

    const mine = deviceId ? await this.votes.findOne({ where: { matchSeq, deviceId } }) : null;
    return {
      matchSeq,
      open,
      myVote: mine?.playerSeq ?? null,
      myVoteName: mine?.playerName ?? null,
      total: tally.reduce((s, t) => s + t.n, 0),
      candidates,
    };
  }

  /** 재투표 불가. 이미 투표했으면 409 */
  async postMvp(matchSeq: number, deviceId: string, body: { playerSeq?: unknown; playerName?: unknown }) {
    const detail = await this.gameService.fetchGame(matchSeq);
    if (!(await this.mvpOpen(detail))) throw new ConflictException("경기가 끝난 뒤에 투표할 수 있습니다");

    const seq = body.playerSeq === null || body.playerSeq === undefined ? null : Number(body.playerSeq);
    const name = typeof body.playerName === "string" ? body.playerName.trim() : "";
    if (seq !== null && !Number.isInteger(seq)) throw new BadRequestException("playerSeq must be an integer or null");
    if (seq === null && !name) throw new BadRequestException("playerSeq 또는 playerName이 필요합니다");

    // 이 경기에 뛴 선수만 받는다. playerSeq가 있으면 그걸로, 없으면 이름으로 (동명이인은 거부)
    const players = await this.gamePlayers(detail, true);
    const matches = seq !== null ? players.filter((p) => p.playerSeq === seq) : players.filter((p) => p.playerName === name);
    if (!matches.length) throw new BadRequestException("이 경기에 출전한 선수가 아닙니다");
    if (matches.length > 1) throw new BadRequestException("같은 이름의 선수가 있어 playerSeq가 필요합니다");
    const target = matches[0];

    try {
      await this.votes.insert({
        matchSeq,
        deviceId,
        playerSeq: target.playerSeq,
        playerName: target.playerName,
        side: target.side,
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException("이미 투표했습니다");
      throw e;
    }
    return this.getMvp(matchSeq, deviceId);
  }
}
