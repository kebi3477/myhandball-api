import { BadRequestException, Controller, Get, Query, Res } from "@nestjs/common";
import { ScheduleService } from "./schedule.service";
import { ScheduleResponse } from "./types";
import { Response } from 'express'

@Controller("schedule")
export class ScheduleController {
  constructor(private readonly svc: ScheduleService) {}

  /**
   * GET /schedule?gender=W&season=2025&type=1
   */
  @Get()
  async getSchedule(
    @Query("gender") gender: "W" | "M" | "" = "W",
    @Query("season") season = "2025",
    @Query("type") type = "1",
    @Query("month") month = "",
  ): Promise<ScheduleResponse> {
    return this.svc.fetchSchedule(gender, season, type, month);
  }

  /**
   * GET /schedule/ics/my-team?gender=W&season=2025&type=1
   */
  @Get("ics/my-team")
  async getMyTeamIcs(
    @Query("gender") gender: "W" | "M" = "W",
    @Query("season") season = "2025",
    @Query("type") type = "1",
    @Query("teamName") teamName: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!teamName) {
      throw new BadRequestException("teamName 쿼리 파라미터가 필요합니다.");
    }

    const ics = await this.svc.buildMyTeamSeasonIcs(
      gender,
      season,
      type,
      teamName,
    );

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");

    res.send(ics);
    // res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    // res.setHeader(
    //   "Content-Disposition",
    //   `attachment; filename="myteam-${encodeURIComponent(teamName)}-${season}.ics"`,
    // );
    // res.send(ics);
  }
}
