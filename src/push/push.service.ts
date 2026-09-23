import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Messaging } from "firebase-admin/messaging";
import { In, QueryFailedError, Repository } from "typeorm";
import { TeamService } from "../team/team.service";
import type { Gender } from "../team/types";
import { createMessaging } from "./fcm.client";
import { PushLog } from "./push-log.entity";
import { PushToken } from "./push-token.entity";
import type { PushKind, PushMatch, PushRegisterResponse } from "./types";

// 핸드볼은 한 경기에 50골이 넘는다. 득점마다 보내지 않고 120초 창으로 묶는다
const GOAL_BATCH_MS = 120 * 1000;
const FCM_BATCH = 500; // sendEachForMulticast 한 번에 보낼 수 있는 최대 토큰 수
const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

export interface GoalSnapshot {
  scoreHome: number;
  scoreAway: number;
  scorerName: string | null;
  scoredBy: "home" | "away" | null;
  minute: number;
}

interface Recipient {
  token: string;
  teamNum: number;
}

const norm = (s: string) => s.replace(/\s+/g, "");

@Injectable()
export class PushService implements OnModuleDestroy {
  private readonly logger = new Logger(PushService.name);
  private readonly messaging: Messaging | null;
  private readonly goalWindows = new Map<number, { timer: NodeJS.Timeout; match: PushMatch; latest: GoalSnapshot }>();

  constructor(
    @InjectRepository(PushToken) private readonly tokens: Repository<PushToken>,
    @InjectRepository(PushLog) private readonly logs: Repository<PushLog>,
    private readonly teamService: TeamService,
  ) {
    this.messaging = createMessaging(this.logger);
  }

  onModuleDestroy() {
    for (const w of this.goalWindows.values()) clearTimeout(w.timer);
    this.goalWindows.clear();
  }

  // ---------- 토큰 등록 ----------

  /** 같은 기기의 재등록은 덮어쓴다. 다시 등록하면 꺼져 있던 토큰도 다시 켠다 */
  async register(deviceId: string, body: Record<string, unknown>): Promise<PushRegisterResponse> {
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token || token.length > 4096) throw new BadRequestException("token이 필요합니다");
    const platform = body.platform;
    if (platform !== "ios" && platform !== "android") throw new BadRequestException("platform must be ios or android");
    const gender = body.gender;
    if (gender !== "M" && gender !== "W") throw new BadRequestException("gender must be M or W");
    const teamNum = body.teamNum === null || body.teamNum === undefined ? null : Number(body.teamNum);
    if (teamNum !== null) {
      if (!Number.isInteger(teamNum)) throw new BadRequestException("teamNum must be an integer or null");
      const teams = (await this.teamService.fetchTeams(gender)).teams;
      if (!teams.some((t) => t.teamNum === teamNum)) throw new NotFoundException(`팀을 찾을 수 없습니다: ${teamNum}`);
    }

    await this.tokens.upsert({ deviceId, token, platform, teamNum, gender, enabled: true }, ["deviceId"]);
    return { ok: true, platform, teamNum, gender, enabled: true };
  }

  /** 구독 해제. 등록한 적이 없어도 성공으로 본다 */
  async unregister(deviceId: string): Promise<{ ok: true }> {
    await this.tokens.delete({ deviceId });
    return { ok: true };
  }

  // ---------- 발송 (폴러가 호출) ----------

  /** 경기 시작 10분 전. 경기당 한 번 */
  async notifyStart(match: PushMatch, timeLabel: string | null) {
    await this.once(match, "start", () => ({
      title: "곧 경기가 시작돼요",
      body: `${timeLabel ? `${timeLabel} ` : ""}${match.homeName} vs ${match.awayName}`,
    }));
  }

  /** 득점. 120초 창을 열고, 창이 열려 있는 동안의 득점은 최신 스코어로 덮어쓴다 */
  queueGoal(match: PushMatch, latest: GoalSnapshot) {
    const open = this.goalWindows.get(match.matchSeq);
    if (open) {
      open.latest = latest;
      return;
    }
    const timer = setTimeout(() => void this.flushGoal(match.matchSeq), GOAL_BATCH_MS);
    this.goalWindows.set(match.matchSeq, { timer, match, latest });
  }

  /** 종료 직전에 열려 있던 득점 창은 보내지 않고 버린다 (종료 알림에 최종 스코어가 들어감) */
  private dropGoalWindow(matchSeq: number) {
    const w = this.goalWindows.get(matchSeq);
    if (w) clearTimeout(w.timer);
    this.goalWindows.delete(matchSeq);
  }

  private async flushGoal(matchSeq: number) {
    const w = this.goalWindows.get(matchSeq);
    this.goalWindows.delete(matchSeq);
    if (!w) return;
    const { match, latest: g } = w;
    const recipients = await this.recipients(match);
    const half = g.minute < 30 ? "전반" : g.minute < 60 ? "후반" : "연장";
    await this.send(match, "goal", recipients, {
      title: `${match.homeName} ${g.scoreHome} : ${g.scoreAway} ${match.awayName}`,
      body: g.scorerName ? `${g.scorerName} 득점 · ${half} ${g.minute}'` : `${half} ${g.minute}'`,
    });
  }

  /** 경기 종료. 받는 사람의 팀 기준으로 승·패·무를 붙인다. 경기당 한 번 */
  async notifyEnd(match: PushMatch, scoreHome: number | null, scoreAway: number | null) {
    this.dropGoalWindow(match.matchSeq);
    const score =
      scoreHome !== null && scoreAway !== null
        ? `${match.homeName} ${scoreHome} : ${scoreAway} ${match.awayName}`
        : `${match.homeName} vs ${match.awayName}`;
    await this.once(match, "end", (teamName) => {
      if (scoreHome === null || scoreAway === null || !teamName) return { title: "경기 종료", body: score };
      const mine = norm(teamName) === norm(match.homeName) ? scoreHome - scoreAway : scoreAway - scoreHome;
      const result = mine > 0 ? "승" : mine < 0 ? "패" : "무";
      return { title: `경기 종료 — ${teamName} ${result}`, body: score };
    });
  }

  // ---------- 내부 ----------

  /** 경기당 한 번만 보내는 알림. push_logs에 먼저 자리를 잡아 재시작·중복 호출에도 한 번만 나간다 */
  private async once(
    match: PushMatch,
    kind: Exclude<PushKind, "goal">,
    message: (teamName: string | null) => { title: string; body: string },
  ) {
    const recipients = await this.recipients(match);
    try {
      await this.logs.insert({ matchSeq: match.matchSeq, kind, recipients: recipients.length });
    } catch (e) {
      if (e instanceof QueryFailedError && (e as any).driverError?.code === "23505") return; // 이미 보냄
      throw e;
    }
    // 팀별로 문구가 다를 수 있어 팀 단위로 나눠 보낸다
    const teamNames = await this.teamNames(match);
    for (const [teamNum, name] of teamNames) {
      const group = recipients.filter((r) => r.teamNum === teamNum);
      if (group.length) await this.send(match, kind, group, message(name));
    }
  }

  /** 경기 두 팀의 teamNum → 팀 이름 */
  private async teamNames(match: PushMatch): Promise<Map<number, string>> {
    const out = new Map<number, string>();
    for (const g of ["M", "W"] as Gender[]) {
      const teams = await this.teamService.fetchTeams(g).then((r) => r.teams).catch(() => []);
      for (const name of [match.homeName, match.awayName]) {
        const t = teams.find((x) => norm(x.name) === norm(name));
        if (t) out.set(t.teamNum, name);
      }
    }
    if (out.size < 2) this.logger.warn(`푸시 대상 팀 매핑 일부 실패 (match_seq=${match.matchSeq})`);
    return out;
  }

  /** 두 팀 중 하나를 마이팀으로 둔, 켜져 있는 기기 */
  private async recipients(match: PushMatch): Promise<Recipient[]> {
    const nums = [...(await this.teamNames(match)).keys()];
    if (!nums.length) return [];
    const rows = await this.tokens.find({ where: { enabled: true, teamNum: In(nums) } });
    return rows.map((r) => ({ token: r.token, teamNum: r.teamNum! }));
  }

  private async send(
    match: PushMatch,
    kind: PushKind,
    recipients: Recipient[],
    msg: { title: string; body: string },
  ) {
    if (!recipients.length) return;
    // 경기별로 알림 센터에 한 줄만 쌓이도록 (Android tag·collapseKey, iOS apns-collapse-id)
    const collapse = `match-${match.matchSeq}`;
    if (!this.messaging) {
      this.logger.log(`[dry-run] ${kind} match_seq=${match.matchSeq} 대상 ${recipients.length}대 — ${msg.title} / ${msg.body}`);
      return;
    }
    for (let i = 0; i < recipients.length; i += FCM_BATCH) {
      const batch = recipients.slice(i, i + FCM_BATCH).map((r) => r.token);
      try {
        const res = await this.messaging.sendEachForMulticast({
          tokens: batch,
          notification: { title: msg.title, body: msg.body },
          data: { matchSeq: String(match.matchSeq), kind },
          android: { collapseKey: collapse, notification: { tag: collapse } },
          apns: { headers: { "apns-collapse-id": collapse } },
        });
        const invalid = res.responses
          .map((r, j) => (!r.success && INVALID_TOKEN_CODES.has(r.error?.code ?? "") ? batch[j] : null))
          .filter((t): t is string => t !== null);
        if (invalid.length) await this.tokens.update({ token: In(invalid) }, { enabled: false });
        this.logger.log(
          `${kind} match_seq=${match.matchSeq} 성공 ${res.successCount} / 실패 ${res.failureCount} (무효 토큰 ${invalid.length}개 끔)`,
        );
      } catch (e) {
        this.logger.error(`FCM 발송 실패 (${kind}, match_seq=${match.matchSeq}): ${e}`);
      }
    }
  }
}
