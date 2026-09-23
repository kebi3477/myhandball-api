import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as cheerio from "cheerio";
import { DataSource, Repository } from "typeorm";
import { CacheService } from "../cache/cache.service";
import { BASE, fetchHtml } from "../common/scrape";
import { GameService } from "../game/game.service";
import { LiveEvent } from "./live-event.entity";
import { MatchState } from "./match-state.entity";
import { computeStatus } from "./match-status";
import { PbpResult, parsePbp, pbpRowKey } from "./pbp.parser";
import type { GameLiveResponse, LiveEventItem } from "./types";

const PBP_EMPTY_TTL_SEC = 60 * 60 * 6;

export interface SyncResult {
  pbp: PbpResult;
  added: number;
}

@Injectable()
export class LiveService {
  private readonly logger = new Logger(LiveService.name);

  constructor(
    @InjectRepository(LiveEvent) private readonly events: Repository<LiveEvent>,
    @InjectRepository(MatchState) private readonly states: Repository<MatchState>,
    private readonly dataSource: DataSource,
    private readonly gameService: GameService,
    private readonly cache: CacheService,
  ) {}

  pbpUrl(matchSeq: number) {
    return `${BASE}/game/playbyplay.php?match_seq=${matchSeq}`;
  }

  /**
   * PBP를 받아 live_events를 원본과 맞춘다. 새 행만 추가하고, 원본에서 사라진 행(정정)은 지우고,
   * 이미 있던 행은 순서·스코어만 갱신한다. `observed`가 false면 새 행의 observedAt을 null로 둔다
   * (종료 후 한꺼번에 받은 기록)
   */
  async syncFromPbp(matchSeq: number, observed: boolean): Promise<SyncResult> {
    const pbp = parsePbp(cheerio.load(await fetchHtml(this.pbpUrl(matchSeq))));
    const now = new Date();

    const added = await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(LiveEvent);
      const existing = new Map((await repo.find({ where: { matchSeq } })).map((e) => [e.rowKey, e]));
      const seen = new Set<string>();
      const toSave: LiveEvent[] = [];
      let addedCount = 0;

      for (const r of pbp.rows) {
        const rowKey = pbpRowKey(r);
        if (seen.has(rowKey)) continue; // 같은 초에 완전히 같은 행이 두 번 → 하나로
        seen.add(rowKey);
        const { half, seq, clock, minute, homeText, awayText, scoreHome, scoreAway, scoredBy, side, type } = r;
        const fields = {
          half, seq, clock, minute, homeText, awayText, scoreHome, scoreAway, scoredBy, side, type,
          playerNumber: r.playerNumber,
          playerName: r.playerName,
          action: r.action,
          assistNumber: r.assistNumber,
          assistName: r.assistName,
        };
        const prev = existing.get(rowKey);
        if (prev) {
          toSave.push(Object.assign(prev, fields));
        } else {
          toSave.push(repo.create({ matchSeq, rowKey, ...fields, observedAt: observed ? now : null }));
          addedCount++;
        }
      }
      const stale = [...existing.values()].filter((e) => !seen.has(e.rowKey));
      if (stale.length) await repo.remove(stale);
      if (toSave.length) await repo.save(toSave, { chunk: 100 });
      return addedCount;
    });

    return { pbp, added };
  }

  async getLive(matchSeq: number): Promise<GameLiveResponse> {
    let state = await this.states.findOne({ where: { matchSeq } });
    let events = await this.loadEvents(matchSeq);

    // 폴링한 적 없는 경기: 상세(01)에서 시작 시각·점수를 얻어 상태를 판정한다
    if (!state) {
      const detail = await this.gameService.fetchGame(matchSeq);
      const status = computeStatus({ startsAt: detail.startsAt, hasFinalScore: detail.scoreHome !== null });
      if (status !== "finished") {
        return {
          matchSeq,
          status: status ?? "pre",
          scoreHome: detail.scoreHome,
          scoreAway: detail.scoreAway,
          startsAt: detail.startsAt,
          lastChangeAt: null,
          source: "polling",
          events: [],
        };
      }
      state = this.states.create({
        matchSeq,
        status: "finished",
        scoreHome: detail.scoreHome,
        scoreAway: detail.scoreAway,
        startsAt: detail.startsAt ? new Date(detail.startsAt) : null,
        lastChangeAt: null,
      });
      await this.states.save(state);
    }

    const status =
      computeStatus({ startsAt: state.startsAt, hasFinalScore: state.scoreHome !== null, state }) ?? state.status;

    // 끝난 경기인데 쌓인 기록이 없으면 PBP에서 한 번 채운다 (종료 후 확정 기록)
    // PBP가 비어 있던 경기는 6시간 동안 다시 부르지 않는다 (요청마다 원본을 치지 않도록)
    const emptyKey = `live:pbp-empty:${matchSeq}`;
    if (status === "finished" && !events.length && !(await this.cache.getJSON<boolean>(emptyKey))) {
      try {
        await this.syncFromPbp(matchSeq, false);
        events = await this.loadEvents(matchSeq);
        if (!events.length) {
          this.logger.warn(`PBP 0건 (match_seq=${matchSeq})`);
          await this.cache.setJSON(emptyKey, true, PBP_EMPTY_TTL_SEC);
        }
      } catch (e) {
        this.logger.warn(`PBP 요청 실패 (match_seq=${matchSeq}): ${e}`);
      }
    }

    const latest = events[0];
    return {
      matchSeq,
      status,
      scoreHome: latest?.scoreHome ?? state.scoreHome,
      scoreAway: latest?.scoreAway ?? state.scoreAway,
      startsAt: state.startsAt?.toISOString() ?? null,
      lastChangeAt: state.lastChangeAt?.toISOString() ?? null,
      source: status === "finished" ? "final" : "polling",
      events: events.map(toItem),
    };
  }

  /** 최신순 (후반 → 전반, 하프 안에서는 뒤 행 → 앞 행) */
  private loadEvents(matchSeq: number) {
    return this.events.find({ where: { matchSeq }, order: { half: "DESC", seq: "DESC" } });
  }
}

function toItem(e: LiveEvent): LiveEventItem {
  return {
    minute: e.minute,
    scoreHome: e.scoreHome,
    scoreAway: e.scoreAway,
    scoredBy: e.scoredBy,
    observedAt: e.observedAt?.toISOString() ?? null,
    half: e.half,
    clock: e.clock,
    type: e.type,
    side: e.side,
    playerNumber: e.playerNumber,
    playerName: e.playerName,
    action: e.action,
    assistNumber: e.assistNumber,
    assistName: e.assistName,
  };
}
