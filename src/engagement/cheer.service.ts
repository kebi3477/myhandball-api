import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, MoreThanOrEqual, Repository } from "typeorm";
import { TeamService } from "../team/team.service";
import type { Gender } from "../team/types";
import { CheerLike } from "./cheer-like.entity";
import { Cheer } from "./cheer.entity";
import type { CheerItem, CheerListResponse } from "./types";

const PAGE_SIZE = 20;
const MAX_TEXT = 200;
const DAILY_LIMIT = 5; // 기기당 팀별 하루 작성 수

/** 오늘 00:00 KST */
function kstDayStart(now = new Date()): Date {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 60 * 60 * 1000);
}

@Injectable()
export class CheerService {
  constructor(
    @InjectRepository(Cheer) private readonly cheers: Repository<Cheer>,
    @InjectRepository(CheerLike) private readonly likes: Repository<CheerLike>,
    private readonly dataSource: DataSource,
    private readonly teamService: TeamService,
  ) {}

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
    const [rows, total] = await this.cheers.findAndCount({
      where: { teamNum, hidden: false },
      order: { createdAt: "DESC", id: "DESC" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
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

    const saved = await this.cheers.save(this.cheers.create({ teamNum, gender: g, deviceId, text }));
    return this.toItem(saved, deviceId, false);
  }

  /** 본인(같은 deviceId) 글만 지운다 */
  async remove(teamNum: number, cheerId: number, deviceId: string): Promise<{ ok: true }> {
    const cheer = await this.cheers.findOne({ where: { id: cheerId, teamNum } });
    if (!cheer) throw new NotFoundException("응원글을 찾을 수 없습니다");
    if (cheer.deviceId !== deviceId) throw new ForbiddenException("본인이 쓴 글만 지울 수 있습니다");
    await this.dataSource.transaction(async (em) => {
      await em.delete(CheerLike, { cheerId });
      await em.delete(Cheer, { id: cheerId });
    });
    return { ok: true };
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
      text: c.text,
      likes: c.likes,
      liked,
      isMine: !!deviceId && c.deviceId === deviceId,
      createdAt: c.createdAt.toISOString(),
    };
  }
}
