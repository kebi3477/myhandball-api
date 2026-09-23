import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { DeviceId } from "./device-id.decorator";
import { GameEngagementService } from "./game-engagement.service";
import type { MvpResponse, PredictionResponse } from "./types";

@Controller("game")
export class GameEngagementController {
  constructor(private readonly service: GameEngagementService) {}

  /** GET /game/5490/prediction — 내 예측 + 분포 */
  @Get(":matchSeq/prediction")
  getPrediction(
    @Param("matchSeq", ParseIntPipe) matchSeq: number,
    @DeviceId() deviceId: string | null,
  ): Promise<PredictionResponse> {
    return this.service.getPrediction(matchSeq, deviceId);
  }

  /** POST /game/5490/prediction { pick } — 시작 전까지 덮어쓰기, 시작 후 409 */
  @Post(":matchSeq/prediction")
  @UseGuards(ThrottlerGuard)
  postPrediction(
    @Param("matchSeq", ParseIntPipe) matchSeq: number,
    @DeviceId("required") deviceId: string,
    @Body() body: { pick?: unknown },
  ): Promise<PredictionResponse> {
    return this.service.putPrediction(matchSeq, deviceId, body?.pick);
  }

  /** GET /game/5490/mvp — 후보·득표 */
  @Get(":matchSeq/mvp")
  getMvp(@Param("matchSeq", ParseIntPipe) matchSeq: number, @DeviceId() deviceId: string | null): Promise<MvpResponse> {
    return this.service.getMvp(matchSeq, deviceId);
  }

  /** POST /game/5490/mvp { playerSeq, playerName } — 종료 후 1회, 재투표 409 */
  @Post(":matchSeq/mvp")
  @UseGuards(ThrottlerGuard)
  postMvp(
    @Param("matchSeq", ParseIntPipe) matchSeq: number,
    @DeviceId("required") deviceId: string,
    @Body() body: { playerSeq?: unknown; playerName?: unknown },
  ): Promise<MvpResponse> {
    return this.service.postMvp(matchSeq, deviceId, body ?? {});
  }
}
