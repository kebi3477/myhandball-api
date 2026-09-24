import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PushService } from "../push/push.service";
import type { PushMatch } from "../push/types";
import { MatchCatalogService } from "../catalog/match-catalog.service";
import { currentSeason, kstDateString } from "../common/season";
import { ScheduleService } from "../schedule/schedule.service";
import { LiveService } from "./live.service";
import { MatchState } from "./match-state.entity";
import { LIVE_IDLE_MS, MAX_DURATION_MS } from "./match-status";

const POLL_INTERVAL_MS = 60 * 1000; // 남의 사이트다. 이보다 짧게 하지 않는다
const LEAD_MS = 10 * 60 * 1000; // 경기 시작 10분 전부터
const MAX_FAILURES = 5;
const MAX_BACKOFF_MS = 10 * 60 * 1000;

interface Target {
  matchSeq: number;
  startsAt: Date;
  label: string;
  homeName: string;
  awayName: string;
  timeLabel: string | null;
}

/**
 * 오늘 경기만 일정 기반으로 폴링한다.
 * 매일 06:00(KST)과 기동 시 오늘 경기를 모아, 시작 10분 전부터 경기별로 60초 간격 폴링.
 * "경기종료" 행을 보거나, 변화 후 20분 정지, 또는 시작 +150분이면 멈춘다.
 */
@Injectable()
export class LivePollerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(LivePollerService.name);
  private readonly timers = new Map<number, NodeJS.Timeout>();

  constructor(
    private readonly scheduleService: ScheduleService,
    private readonly liveService: LiveService,
    @InjectRepository(MatchState) private readonly states: Repository<MatchState>,
    private readonly pushService: PushService,
    private readonly catalog: MatchCatalogService,
  ) {}

  private pushMatch(t: Target): PushMatch {
    return { matchSeq: t.matchSeq, homeName: t.homeName, awayName: t.awayName };
  }

  /** 푸시 실패가 폴링을 멈추지 않도록 */
  private async safePush(what: string, fn: () => Promise<unknown> | unknown) {
    try {
      await fn();
    } catch (e) {
      this.logger.error(`푸시 실패 (${what}): ${e}`);
    }
  }

  onApplicationBootstrap() {
    if (process.env.LIVE_POLLING === "false") {
      this.logger.log("LIVE_POLLING=false — 폴링 비활성");
      return;
    }
    // 기동 도중 오늘 경기를 놓치지 않도록 한 번 계획한다 (실패해도 기동은 계속)
    void this.planToday();
  }

  onModuleDestroy() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  @Cron("0 6 * * *", { timeZone: "Asia/Seoul" })
  async planToday() {
    if (process.env.LIVE_POLLING === "false") return;
    try {
      const targets = await this.todaysGames();
      this.logger.log(`오늘 경기 ${targets.length}건: ${targets.map((t) => t.label).join(", ") || "-"}`);
      for (const t of targets) this.schedule(t);
    } catch (e) {
      this.logger.error(`오늘 경기 조회 실패: ${e}`);
    }
  }

  private async todaysGames(): Promise<Target[]> {
    const today = kstDateString();
    const season = currentSeason();
    const month = today.slice(5, 7);

    const out: Target[] = [];
    for (const gender of ["M", "W"] as const) {
      for (const type of ["1", "2"]) {
        const res = await this.scheduleService.fetchSchedule(gender, season, type, month);
        for (const day of res.days) {
          if (day.dateISO !== today) continue;
          for (const g of day.games) {
            if (g.matchSeq === null || !g.startsAt) continue;
            out.push({
              matchSeq: g.matchSeq,
              startsAt: new Date(g.startsAt),
              label: `${g.matchSeq} ${g.home.name}-${g.away.name} ${g.time ?? ""}`,
              homeName: g.home.name,
              awayName: g.away.name,
              timeLabel: g.time,
            });
          }
        }
      }
    }
    return out;
  }

  private schedule(t: Target) {
    if (this.timers.has(t.matchSeq)) return;
    const now = Date.now();
    const end = t.startsAt.getTime() + MAX_DURATION_MS;
    if (now >= end) return;
    const delay = Math.max(0, t.startsAt.getTime() - LEAD_MS - now);
    this.timers.set(
      t.matchSeq,
      setTimeout(() => void this.startPolling(t), delay),
    );
  }

  private async startPolling(t: Target) {
    const existing = await this.states.findOne({ where: { matchSeq: t.matchSeq } });
    if (existing?.status === "finished") {
      this.timers.delete(t.matchSeq);
      return;
    }
    await this.states.save(
      this.states.create({
        matchSeq: t.matchSeq,
        status: existing?.status ?? "pre",
        scoreHome: existing?.scoreHome ?? null,
        scoreAway: existing?.scoreAway ?? null,
        startsAt: t.startsAt,
        lastChangeAt: existing?.lastChangeAt ?? null,
      }),
    );
    this.logger.log(`폴링 시작: ${t.label}`);
    // 시작 전에 폴링이 시작됐을 때만 "곧 시작" 알림 (경기 중 재시작 시에는 보내지 않음)
    if (Date.now() < t.startsAt.getTime()) {
      await this.safePush("start", () => this.pushService.notifyStart(this.pushMatch(t), t.timeLabel));
    }
    await this.tick(t, 0);
  }

  private async tick(t: Target, failures: number) {
    let nextDelay = POLL_INTERVAL_MS;
    try {
      const { pbp, added, newGoals } = await this.liveService.syncFromPbp(t.matchSeq, true);
      const state = await this.states.findOneByOrFail({ matchSeq: t.matchSeq });
      const last = pbp.rows[pbp.rows.length - 1];
      const now = new Date();

      if (added > 0) state.lastChangeAt = now;
      if (last) {
        state.scoreHome = last.scoreHome;
        state.scoreAway = last.scoreAway;
      }
      if (pbp.finished) state.status = "finished";
      else if (pbp.started || added > 0) state.status = "live";
      await this.states.save(state);
      failures = 0;

      // 득점 푸시는 PushService가 120초 창으로 묶는다. 이미 끝난 뒤 한꺼번에 보인 득점은 보내지 않음
      const goal = newGoals[newGoals.length - 1];
      if (goal && !pbp.finished) {
        await this.safePush("goal", () =>
          this.pushService.queueGoal(this.pushMatch(t), {
            scoreHome: state.scoreHome ?? goal.scoreHome,
            scoreAway: state.scoreAway ?? goal.scoreAway,
            scorerName: goal.playerName,
            scoredBy: goal.scoredBy,
            minute: goal.minute,
          }),
        );
      }

      const idle = state.lastChangeAt && now.getTime() - state.lastChangeAt.getTime() >= LIVE_IDLE_MS;
      const tooLong = now.getTime() >= t.startsAt.getTime() + MAX_DURATION_MS;
      if (pbp.finished || idle || tooLong) {
        if (state.lastChangeAt) state.status = "finished";
        await this.states.save(state);
        const why = pbp.finished ? "경기종료" : idle ? "20분간 변화 없음" : "시작 +150분";
        if (state.status === "finished") {
          await this.safePush("end", () =>
            this.pushService.notifyEnd(this.pushMatch(t), state.scoreHome, state.scoreAway),
          );
        }
        this.logger.log(`폴링 종료 (${why}): ${t.label} ${state.scoreHome}:${state.scoreAway}`);
        if (state.status === "finished") {
          // 승부예측 적중 판정 (실패해도 30분 주기 동기화가 다시 한다)
          await this.catalog
            .syncSeason(currentSeason())
            .catch((e) => this.logger.warn(`종료 후 적중 판정 실패: ${e}`));
        }
        if (!pbp.started && !pbp.rows.length) {
          this.logger.warn(`PBP가 끝까지 비어 있었음 — 실시간 갱신이 안 되는 경기일 수 있음: ${t.label}`);
        }
        this.timers.delete(t.matchSeq);
        return;
      }
    } catch (e) {
      failures++;
      if (failures >= MAX_FAILURES) {
        this.logger.error(`연속 ${failures}회 실패로 폴링 중단: ${t.label} — ${e}`);
        this.timers.delete(t.matchSeq);
        return;
      }
      nextDelay = Math.min(POLL_INTERVAL_MS * 2 ** failures, MAX_BACKOFF_MS);
      this.logger.warn(`폴링 실패 ${failures}회, ${nextDelay / 1000}초 후 재시도: ${t.label} — ${e}`);
    }
    this.timers.set(
      t.matchSeq,
      setTimeout(() => void this.tick(t, failures), nextDelay),
    );
  }
}
