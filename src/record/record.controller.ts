import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { currentSeason } from "../common/season";
import type { Gender } from "../team/types";
import { RecordService } from "./record.service";
import type { TeamRecordsResponse } from "./types";

@Controller("record")
export class RecordController {
  constructor(private readonly recordService: RecordService) {}

  /**
   * GET /record/team?gender=M&season=2025&type=1
   * gender 기본 M, season 기본 현재 시즌(currentSeason), type 기본 1(정규리그)
   */
  @Get("team")
  async getTeamRecords(
    @Query("gender") gender = "M",
    @Query("season") season?: string,
    @Query("type") type = "1",
  ): Promise<TeamRecordsResponse> {
    if (gender !== "M" && gender !== "W") throw new BadRequestException("gender must be M or W");
    const s = season || currentSeason();
    if (!/^\d{4}$/.test(s)) throw new BadRequestException("season must be a 4-digit year");
    if (type !== "1" && type !== "2") throw new BadRequestException("type must be 1 or 2");
    return this.recordService.fetchTeamRecords(gender as Gender, s, type);
  }
}
