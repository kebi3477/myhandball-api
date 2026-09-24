import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AUTHOR_ID_RE, authorIdOf } from "./author-id";
import { Block } from "./block.entity";
import type { BlockItem, BlockListResponse } from "./types";

@Injectable()
export class BlockService {
  constructor(@InjectRepository(Block) private readonly blocks: Repository<Block>) {}

  /** 멱등. 이미 차단했어도 성공. 자기 자신은 400 */
  async block(deviceId: string, rawAuthorId: unknown): Promise<BlockItem> {
    const authorId = typeof rawAuthorId === "string" ? rawAuthorId.trim().toLowerCase() : "";
    if (!AUTHOR_ID_RE.test(authorId)) throw new BadRequestException("authorId 형식이 올바르지 않아요");
    if (authorId === authorIdOf(deviceId)) throw new BadRequestException("나를 차단할 수는 없어요");
    await this.blocks.createQueryBuilder().insert().values({ deviceId, authorId }).orIgnore().execute();
    const row = await this.blocks.findOneOrFail({ where: { deviceId, authorId } });
    return { authorId: row.authorId, createdAt: row.createdAt.toISOString() };
  }

  /** 없어도 성공 */
  async unblock(deviceId: string, authorId: string): Promise<void> {
    await this.blocks.delete({ deviceId, authorId: authorId.toLowerCase() });
  }

  async list(deviceId: string): Promise<BlockListResponse> {
    const rows = await this.blocks.find({ where: { deviceId }, order: { createdAt: "DESC" } });
    return { items: rows.map((r) => ({ authorId: r.authorId, createdAt: r.createdAt.toISOString() })) };
  }
}
