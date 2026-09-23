import { BadRequestException, Controller, Get, Param, ParseIntPipe, Query } from "@nestjs/common";
import { PlayerService } from "./player.service";
import type { Gender } from "../team/types";
import {
  PlayerDetailResponse,
  PlayerListResponse,
  PlayerRankingResponse,
  STAT_CATEGORIES,
  StatCategory,
} from "./types";

function parseGender(gender: string): Gender {
  if (gender !== "M" && gender !== "W") throw new BadRequestException("gender must be M or W");
  return gender;
}

@Controller("player")
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  /**
   * GET /player?gender=M&season=2025&type=1
   */
  @Get()
  async getPlayers(
    @Query("gender") gender = "W",
    @Query("season") season = "2025",
    @Query("type") type = "1",
  ): Promise<PlayerListResponse> {
    return this.playerService.fetchList(parseGender(gender), season, type);
  }

  /**
   * GET /player/ranking?gender=M&season=2025&type=1&category=goals
   */
  @Get("ranking")
  async getRanking(
    @Query("gender") gender = "W",
    @Query("season") season = "2025",
    @Query("type") type = "1",
    @Query("category") category = "goals",
  ): Promise<PlayerRankingResponse> {
    if (!(STAT_CATEGORIES as readonly string[]).includes(category)) {
      throw new BadRequestException(`category must be one of ${STAT_CATEGORIES.join(", ")}`);
    }
    return this.playerService.fetchRanking(parseGender(gender), season, type, category as StatCategory);
  }

  /**
   * GET /player/101
   */
  @Get(":playerSeq")
  async getPlayer(@Param("playerSeq", ParseIntPipe) playerSeq: number): Promise<PlayerDetailResponse> {
    return this.playerService.fetchDetail(playerSeq);
  }
}
