import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { LiveService } from "./live.service";
import type { GameLiveResponse } from "./types";

@Controller("game")
export class LiveController {
  constructor(private readonly liveService: LiveService) {}

  /**
   * GET /game/5490/live — 캐시 없음, DB를 직접 읽는다
   */
  @Get(":matchSeq/live")
  async getLive(@Param("matchSeq", ParseIntPipe) matchSeq: number): Promise<GameLiveResponse> {
    return this.liveService.getLive(matchSeq);
  }
}
