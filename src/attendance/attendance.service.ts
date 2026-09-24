import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MatchCatalogService } from "../catalog/match-catalog.service";
import { MAX_DURATION_MS } from "../live/match-status";
import { Attendance } from "./attendance.entity";
import type { AttendanceItem, AttendanceResponse } from "./types";

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance) private readonly attendances: Repository<Attendance>,
    private readonly catalog: MatchCatalogService,
  ) {}

  async list(deviceId: string, season: string): Promise<AttendanceResponse> {
    const rows = await this.attendances
      .createQueryBuilder("a")
      .innerJoin("match_meta", "m", "m.match_seq = a.match_seq")
      .where("a.device_id = :deviceId", { deviceId })
      .andWhere("m.season = :season", { season })
      .orderBy("a.created_at", "DESC")
      .getMany();
    return { season, items: rows.map(toItem) };
  }

  /** 멱등. 끝난 경기만 받는다 (앞으로 할 경기는 400) */
  async put(deviceId: string, matchSeq: number): Promise<AttendanceItem> {
    const meta = await this.catalog.ensure(matchSeq);
    if (!meta) throw new NotFoundException(`경기를 찾을 수 없습니다: ${matchSeq}`);
    // 결과가 확정됐거나, 결과가 없어도 시작 +150분이 지났으면 끝난 경기로 본다
    const ended =
      meta.result !== null || (meta.startsAt !== null && Date.now() >= meta.startsAt.getTime() + MAX_DURATION_MS);
    if (!ended) throw new BadRequestException("끝난 경기만 직관 기록할 수 있어요");

    await this.attendances
      .createQueryBuilder()
      .insert()
      .values({ deviceId, matchSeq })
      .orIgnore() // 이미 있으면 그대로 통과
      .execute();
    const row = await this.attendances.findOneOrFail({ where: { deviceId, matchSeq } });
    return toItem(row);
  }

  /** 없어도 성공 */
  async remove(deviceId: string, matchSeq: number): Promise<void> {
    await this.attendances.delete({ deviceId, matchSeq });
  }
}

function toItem(a: Attendance): AttendanceItem {
  return { matchSeq: a.matchSeq, attendedAt: a.createdAt.toISOString() };
}
