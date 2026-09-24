import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { SeasonResponse, SeasonService } from "./season.service";

@Controller("season")
export class SeasonController {
  constructor(private readonly seasonService: SeasonService) {}

  /**
   * GET /season?gender=M — 개막일·종료일·비시즌 여부·다음 시즌 개막일.
   * 남자부는 11월, 여자부는 1월 개막이라 gender가 필요하다.
   * 개발용: ?now=<ISO 8601> 로 시각을 옮겨 볼 수 있다 (운영에서는 무시)
   */
  @Get()
  get(@Query("gender") gender?: string, @Query("now") now?: string): Promise<SeasonResponse> {
    if (gender !== "M" && gender !== "W") throw new BadRequestException("gender는 M 또는 W여야 해요");
    let at: number | undefined;
    if (now && process.env.NODE_ENV !== "production") {
      at = Date.parse(now);
      if (Number.isNaN(at)) throw new BadRequestException("now는 ISO 8601이어야 해요");
    }
    return this.seasonService.get(gender, at);
  }
}
