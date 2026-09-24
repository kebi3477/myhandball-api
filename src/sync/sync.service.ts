import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { FavoritePlayer } from "./favorite-player.entity";
import { GuideProgress } from "./guide-progress.entity";
import type { FavoritePlayerItem, FavoritePlayersResponse, GuideProgressResponse } from "./types";

/** 입문 가이드 레슨 수 (앱 AppConfig.guideLessonCount와 같아야 한다) */
export const GUIDE_LESSONS = 5;

/**
 * 기기에만 있던 설정(관심 선수, 가이드 진행도)을 서버에 둔다.
 * 기기 ID가 iOS Keychain에 있어 재설치해도 같은 ID가 오므로, 재설치 후 복구된다
 */
@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(FavoritePlayer) private readonly favorites: Repository<FavoritePlayer>,
    @InjectRepository(GuideProgress) private readonly guides: Repository<GuideProgress>,
    private readonly dataSource: DataSource,
  ) {}

  // ---------- 관심 선수 ----------

  async listFavorites(deviceId: string): Promise<FavoritePlayersResponse> {
    const rows = await this.favorites.find({ where: { deviceId }, order: { createdAt: "DESC", id: "DESC" } });
    return { items: rows.map(toFavorite) };
  }

  /** 멱등. 이미 있으면 처음 추가한 시각 그대로 */
  async addFavorite(deviceId: string, playerSeq: number): Promise<FavoritePlayerItem> {
    if (playerSeq <= 0) throw new BadRequestException("playerSeq가 올바르지 않아요");
    await this.favorites.createQueryBuilder().insert().values({ deviceId, playerSeq }).orIgnore().execute();
    return toFavorite(await this.favorites.findOneOrFail({ where: { deviceId, playerSeq } }));
  }

  /** 없어도 성공 */
  async removeFavorite(deviceId: string, playerSeq: number): Promise<void> {
    await this.favorites.delete({ deviceId, playerSeq });
  }

  // ---------- 가이드 진행도 ----------

  async getGuide(deviceId: string): Promise<GuideProgressResponse> {
    const row = await this.guides.findOne({ where: { deviceId } });
    return toGuide(row);
  }

  /**
   * 값을 내리는 요청은 무시한다 (서버에 5가 있는데 3이 오면 5 유지).
   * 수료일은 처음 GUIDE_LESSONS를 채운 순간 한 번만 정해진다. 둘 다 한 문장으로 처리해 동시 요청에도 안전하다
   */
  async putGuide(deviceId: string, raw: unknown): Promise<GuideProgressResponse> {
    const doneCount = typeof raw === "number" ? raw : Number.NaN;
    if (!Number.isInteger(doneCount) || doneCount < 0 || doneCount > GUIDE_LESSONS) {
      throw new BadRequestException(`doneCount는 0~${GUIDE_LESSONS} 사이 정수여야 해요`);
    }
    const [row]: { done_count: number; completed_at: Date | null }[] = await this.dataSource.query(
      `INSERT INTO guide_progress (device_id, done_count, completed_at, updated_at)
            VALUES ($1, $2::int, CASE WHEN $2::int >= $3::int THEN now() END, now())
       ON CONFLICT (device_id) DO UPDATE
             SET done_count   = GREATEST(guide_progress.done_count, EXCLUDED.done_count),
                 completed_at = COALESCE(guide_progress.completed_at, EXCLUDED.completed_at),
                 updated_at   = now()
       RETURNING done_count, completed_at`,
      [deviceId, doneCount, GUIDE_LESSONS],
    );
    return { doneCount: row.done_count, completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null };
  }
}

function toFavorite(f: FavoritePlayer): FavoritePlayerItem {
  return { playerSeq: f.playerSeq, addedAt: f.createdAt.toISOString() };
}

function toGuide(g: GuideProgress | null): GuideProgressResponse {
  return { doneCount: g?.doneCount ?? 0, completedAt: g?.completedAt?.toISOString() ?? null };
}
