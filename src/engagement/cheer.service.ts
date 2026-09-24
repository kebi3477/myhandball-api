import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, IsNull, MoreThanOrEqual, QueryFailedError, Repository } from "typeorm";
import { TeamService } from "../team/team.service";
import type { Gender } from "../team/types";
import { authorIdOf } from "./author-id";
import { Block } from "./block.entity";
import { CheerLike } from "./cheer-like.entity";
import { CheerReport } from "./cheer-report.entity";
import { Cheer } from "./cheer.entity";
import type { CheerItem, CheerListResponse, ReportReason } from "./types";

const PAGE_SIZE = 20;
const MAX_TEXT = 200;
const DAILY_LIMIT = 5; // 기기당 팀별 하루 작성 수
// 신고가 이만큼 쌓이면 사람이 보기 전에 자동으로 숨긴다 (방치하면 심사에서 "실효성 없음"으로 본다)
export const REPORT_HIDE_THRESHOLD = 3;
const REPORT_REASONS: ReportReason[] = ["spam", "abuse", "sexual", "other"];
const MAX_REPORT_DETAIL = 200;

/** 오늘 00:00 KST */
function kstDayStart(now = new Date()): Date {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 60 * 60 * 1000);
}

@Injectable()
export class CheerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CheerService.name);

  constructor(
    @InjectRepository(Cheer) private readonly cheers: Repository<Cheer>,
    @InjectRepository(CheerLike) private readonly likes: Repository<CheerLike>,
    @InjectRepository(CheerReport) private readonly reports: Repository<CheerReport>,
    @InjectRepository(Block) private readonly blocks: Repository<Block>,
    private readonly dataSource: DataSource,
    private readonly teamService: TeamService,
  ) {}

  /** author_id가 생기기 전에 쓴 글에 작성자 식별자를 채운다 */
  async onApplicationBootstrap() {
    const missing = await this.cheers.find({ where: { authorId: IsNull() } });
    for (const c of missing) await this.cheers.update({ id: c.id }, { authorId: authorIdOf(c.deviceId) });
    if (missing.length) this.logger.log(`응원글 ${missing.length}건에 작성자 식별자 채움`);
  }

  /** 팀이 실제로 있는지 확인하고 성별을 정한다. gender를 안 주면 남녀 목록에서 찾는다 */
  private async resolveTeam(teamNum: number, gender: Gender | null): Promise<Gender> {
    for (const g of gender ? [gender] : (["M", "W"] as Gender[])) {
      const teams = (await this.teamService.fetchTeams(g)).teams;
      if (teams.some((t) => t.teamNum === teamNum)) return g;
    }
    throw new NotFoundException(`팀을 찾을 수 없습니다: ${teamNum}`);
  }

  async list(teamNum: number, gender: Gender | null, page: number, deviceId: string | null): Promise<CheerListResponse> {
    await this.resolveTeam(teamNum, gender);
    // 내가 차단한 작성자의 글과 내가 신고한 글은 뺀다 (기기 단위). 신고한 글은 신고 즉시 내 화면에서 사라진다
    const blocked = deviceId ? (await this.blocks.find({ where: { deviceId } })).map((b) => b.authorId) : [];
    const reported = deviceId ? (await this.reports.find({ where: { deviceId } })).map((r) => r.cheerId) : [];
    const qb = this.cheers
      .createQueryBuilder("c")
      .where("c.team_num = :teamNum AND c.hidden = false", { teamNum })
      .orderBy("c.created_at", "DESC")
      .addOrderBy("c.id", "DESC")
      .skip((page - 1) * PAGE_SIZE)
      .take(PAGE_SIZE);
    if (blocked.length) qb.andWhere("c.author_id NOT IN (:...blocked)", { blocked });
    if (reported.length) qb.andWhere("c.id NOT IN (:...reported)", { reported });
    const [rows, total] = await qb.getManyAndCount();
    const liked = new Set(
      deviceId && rows.length
        ? (await this.likes.find({ where: { deviceId, cheerId: In(rows.map((r) => r.id)) } })).map((l) => l.cheerId)
        : [],
    );
    return {
      teamNum,
      total,
      page,
      items: rows.map((r) => this.toItem(r, deviceId, liked.has(r.id))),
    };
  }

  async create(teamNum: number, gender: Gender | null, deviceId: string, rawText: unknown): Promise<CheerItem> {
    const text = typeof rawText === "string" ? rawText.trim() : "";
    if (!text) throw new BadRequestException("text가 필요합니다");
    if ([...text].length > MAX_TEXT) throw new BadRequestException(`text는 ${MAX_TEXT}자까지입니다`);
    const g = await this.resolveTeam(teamNum, gender);

    const today = await this.cheers.count({
      where: { teamNum, deviceId, createdAt: MoreThanOrEqual(kstDayStart()) },
    });
    if (today >= DAILY_LIMIT) {
      throw new HttpException(`응원글은 팀별로 하루 ${DAILY_LIMIT}개까지 쓸 수 있습니다`, HttpStatus.TOO_MANY_REQUESTS);
    }

    const saved = await this.cheers.save(
      this.cheers.create({ teamNum, gender: g, deviceId, authorId: authorIdOf(deviceId), text }),
    );
    return this.toItem(saved, deviceId, false);
  }

  /** 본인(같은 deviceId) 글만 지운다 */
  async remove(teamNum: number, cheerId: number, deviceId: string): Promise<{ ok: true }> {
    const cheer = await this.cheers.findOne({ where: { id: cheerId, teamNum } });
    if (!cheer) throw new NotFoundException("응원글을 찾을 수 없습니다");
    if (cheer.deviceId !== deviceId) throw new ForbiddenException("본인이 쓴 글만 지울 수 있습니다");
    await this.dataSource.transaction(async (em) => {
      await em.delete(CheerLike, { cheerId });
      await em.delete(CheerReport, { cheerId });
      await em.delete(Cheer, { id: cheerId });
    });
    return { ok: true };
  }

  /**
   * 신고. 같은 기기가 같은 글을 다시 신고하면 409.
   * 신고한 기기에서는 즉시 안 보이고(list), 신고가 REPORT_HIDE_THRESHOLD건 쌓이면 모두에게 숨긴다.
   * 운영자는 관리자 페이지에서 24시간 안에 검토해 삭제하거나 복원한다 (이용약관·처리방침에 약속한 기한)
   */
  async report(
    teamNum: number,
    cheerId: number,
    deviceId: string,
    body: { reason?: unknown; detail?: unknown },
  ): Promise<{ reported: true }> {
    const reason = body.reason as ReportReason;
    if (!REPORT_REASONS.includes(reason)) {
      throw new BadRequestException(`reason은 ${REPORT_REASONS.join(", ")} 중 하나여야 해요`);
    }
    let detail: string | null = null;
    if (body.detail !== undefined && body.detail !== null) {
      if (typeof body.detail !== "string") throw new BadRequestException("detail은 문자열이어야 해요");
      detail = body.detail.trim() || null;
      if (detail && [...detail].length > MAX_REPORT_DETAIL) {
        throw new BadRequestException(`detail은 ${MAX_REPORT_DETAIL}자까지예요`);
      }
    }

    const cheer = await this.cheers.findOne({ where: { id: cheerId, teamNum, hidden: false } });
    if (!cheer) throw new NotFoundException("응원글을 찾을 수 없습니다");
    if (cheer.deviceId === deviceId) throw new BadRequestException("내가 쓴 글은 신고할 수 없어요");

    try {
      await this.reports.insert({ cheerId, deviceId, reason, detail });
    } catch (e) {
      if (e instanceof QueryFailedError && (e as any).driverError?.code === "23505") {
        throw new ConflictException("이미 신고한 글이에요");
      }
      throw e;
    }
    const count = await this.reports.count({ where: { cheerId } });
    if (count >= REPORT_HIDE_THRESHOLD) {
      await this.cheers.update({ id: cheerId }, { hidden: true });
      this.logger.warn(`응원글 ${cheerId} 신고 ${count}건 — 자동 숨김`);
    }
    return { reported: true };
  }

  /** 좋아요 토글 */
  async toggleLike(teamNum: number, cheerId: number, deviceId: string): Promise<CheerItem> {
    return this.dataSource.transaction(async (em) => {
      // 동시 토글에서 likes 카운트가 어긋나지 않도록 글 행을 잠근다
      const cheer = await em
        .getRepository(Cheer)
        .createQueryBuilder("c")
        .setLock("pessimistic_write")
        .where("c.id = :cheerId AND c.team_num = :teamNum AND c.hidden = false", { cheerId, teamNum })
        .getOne();
      if (!cheer) throw new NotFoundException("응원글을 찾을 수 없습니다");

      const existing = await em.findOne(CheerLike, { where: { cheerId, deviceId } });
      if (existing) {
        await em.delete(CheerLike, { id: existing.id });
        cheer.likes = Math.max(0, cheer.likes - 1);
      } else {
        await em.insert(CheerLike, { cheerId, deviceId });
        cheer.likes += 1;
      }
      await em.update(Cheer, { id: cheerId }, { likes: cheer.likes });
      return this.toItem(cheer, deviceId, !existing);
    });
  }

  private toItem(c: Cheer, deviceId: string | null, liked: boolean): CheerItem {
    // 작성자는 익명이다. 이름을 만들어내지 않고 isMine만 준다
    return {
      id: c.id,
      authorId: c.authorId ?? authorIdOf(c.deviceId),
      text: c.text,
      likes: c.likes,
      liked,
      isMine: !!deviceId && c.deviceId === deviceId,
      createdAt: c.createdAt.toISOString(),
    };
  }
}
