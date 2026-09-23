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
  myTeam(
    @Query("teamNum", ParseIntPipe) teamNum: number,
    @Query("gender") gender: string,
    @Query("now") now?: string,
  ): Promise<WidgetResponse> {
    if (gender !== "M" && gender !== "W") throw new BadRequestException("gender must be M or W");
    return this.widgetService.myTeam(teamNum, gender, this.devNow(now));
  }

  /**
   * 개발용 시각 이동: `?now=2025-11-15T16:00:00+09:00`. 지난 시즌 데이터로 위젯 상태를 볼 때 쓴다.
   * 운영(NODE_ENV=production)에서는 무시한다
   */
  private devNow(now?: string): number | undefined {
    if (!now || process.env.NODE_ENV === "production") return undefined;
    const t = Date.parse(now);
    if (Number.isNaN(t)) throw new BadRequestException("now must be an ISO 8601 datetime");
    return t;
  }
}
