import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Put, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { DeviceId } from "../engagement/device-id.decorator";
import { SyncService } from "./sync.service";
import type { FavoritePlayerItem, FavoritePlayersResponse, GuideProgressResponse } from "./types";

@Controller()
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /** GET /favorites/players — 추가한 순서 역순 */
  @Get("favorites/players")
  favorites(@DeviceId("required") deviceId: string): Promise<FavoritePlayersResponse> {
    return this.sync.listFavorites(deviceId);
  }

  /** PUT /favorites/players/:playerSeq — 멱등 */
  @Put("favorites/players/:playerSeq")
  @UseGuards(ThrottlerGuard)
  addFavorite(
    @DeviceId("required") deviceId: string,
    @Param("playerSeq", ParseIntPipe) playerSeq: number,
  ): Promise<FavoritePlayerItem> {
    return this.sync.addFavorite(deviceId, playerSeq);
  }

  /** DELETE /favorites/players/:playerSeq — 없어도 204 */
  @Delete("favorites/players/:playerSeq")
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  async removeFavorite(
    @DeviceId("required") deviceId: string,
    @Param("playerSeq", ParseIntPipe) playerSeq: number,
  ): Promise<void> {
    await this.sync.removeFavorite(deviceId, playerSeq);
  }

  /** GET /progress/guide — 기록이 없으면 { doneCount: 0, completedAt: null } */
  @Get("progress/guide")
  guide(@DeviceId("required") deviceId: string): Promise<GuideProgressResponse> {
    return this.sync.getGuide(deviceId);
  }

  /** PUT /progress/guide { doneCount } — 내려가지 않는다 */
  @Put("progress/guide")
  @UseGuards(ThrottlerGuard)
  putGuide(@DeviceId("required") deviceId: string, @Body() body: { doneCount?: unknown }): Promise<GuideProgressResponse> {
    return this.sync.putGuide(deviceId, body?.doneCount);
  }
}
