import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { GameService } from "./game.service";
import type { GameDetailResponse } from "./types";

@Controller("game")
export class GameController {
  constructor(private readonly gameService: GameService) {}

  /**
   * GET /game/5490
   */
  @Get(":matchSeq")
  async getGame(@Param("matchSeq", ParseIntPipe) matchSeq: number): Promise<GameDetailResponse> {
    return this.gameService.fetchGame(matchSeq);
  }
}
