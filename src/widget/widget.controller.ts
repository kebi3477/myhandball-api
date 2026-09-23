import { BadRequestException, Controller, Get, ParseIntPipe, Query } from "@nestjs/common";
import { WidgetService } from "./widget.service";
import type { WidgetResponse } from "./types";

@Controller("widget")
export class WidgetController {
  constructor(private readonly widgetService: WidgetService) {}

  /**
   * GET /widget/my-team?teamNum=132&gender=M — 캐시 없음, 5KB 미만
   */
  @Get("my-team")
  myTeam(@Query("teamNum", ParseIntPipe) teamNum: number, @Query("gender") gender: string): Promise<WidgetResponse> {
    if (gender !== "M" && gender !== "W") throw new BadRequestException("gender must be M or W");
    return this.widgetService.myTeam(teamNum, gender);
  }
}
