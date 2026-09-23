import { Controller, Get, Query } from "@nestjs/common";
import { RankingService } from "./ranking.service";
import type { RankingResponse } from "./types";
import type { Gender } from "../team/types"; // 경로 조절

@Controller("ranking")
export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  @Get()
  async getRanking(
    @Query("gender") gender: Gender = "W",
    @Query("season") season = "2024",
    @Query("type") type = "1",
  ): Promise<RankingResponse> {
    const g: Gender = gender === "M" ? "M" : "W";
    return this.rankingService.fetchRanking(g, season, type);
  }
}
