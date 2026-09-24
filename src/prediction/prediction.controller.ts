import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { currentSeason } from "../common/season";
import { DeviceId } from "../engagement/device-id.decorator";
import type { Gender } from "../team/types";
import { PredictionStatsService } from "./prediction-stats.service";
import type { FandomResponse, LeaderboardResponse, MyPredictionsResponse, PredictionWeekResponse } from "./types";

function seasonOf(season?: string): string {
  const s = season?.trim() || currentSeason();
  if (!/^\d{4}$/.test(s)) throw new BadRequestException("season은 시작 연도(예: 2025)여야 해요");
  return s;
}

function genderOf(gender: string | undefined, required: boolean): Gender | null {
  if (!gender) {
    if (required) throw new BadRequestException("gender는 M 또는 W여야 해요");
    return null;
  }
  if (gender !== "M" && gender !== "W") throw new BadRequestException("gender는 M 또는 W여야 해요");
  return gender;
}

function intOf(raw: string | undefined, def: number, min: number, max: number, name: string): number {
  if (raw === undefined || raw === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new BadRequestException(`${name}는 ${min}~${max} 사이 정수여야 해요`);
  return n;
}

@Controller("prediction")
export class PredictionController {
  constructor(private readonly stats: PredictionStatsService) {}

  /** GET /prediction/week?gender=&season=&type=&days=7 — gender·type 생략 시 전부 */
  @Get("week")
  week(
    @DeviceId() deviceId: string | null,
    @Query("gender") gender?: string,
    @Query("season") season?: string,
    @Query("type") type?: string,
    @Query("days") days?: string,
  ): Promise<PredictionWeekResponse> {
    const g = genderOf(gender, false);
    if (type && type !== "1" && type !== "2") throw new BadRequestException("type은 1 또는 2여야 해요");
    return this.stats.week(
      g ? [g] : ["M", "W"],
      seasonOf(season),
      type ? [type] : ["1", "2"],
      intOf(days, 7, 1, 31, "days"),
      deviceId,
    );
  }

  /** GET /prediction/leaderboard?season=&scope=all|team&teamNum=&limit=20 */
  @Get("leaderboard")
  leaderboard(
    @DeviceId() deviceId: string | null,
    @Query("season") season?: string,
    @Query("scope") scope = "all",
    @Query("teamNum") teamNum?: string,
    @Query("limit") limit?: string,
  ): Promise<LeaderboardResponse> {
    if (scope !== "all" && scope !== "team") throw new BadRequestException("scope는 all 또는 team이어야 해요");
    const t = teamNum ? Number(teamNum) : null;
    if (scope === "team" && (t === null || !Number.isInteger(t))) {
      throw new BadRequestException("scope=team이면 teamNum이 필요해요");
    }
    return this.stats.leaderboard(seasonOf(season), scope, t, intOf(limit, 20, 1, 100, "limit"), deviceId);
  }

  /** GET /prediction/fandom?gender=M&season= */
  @Get("fandom")
  fandom(@Query("gender") gender?: string, @Query("season") season?: string): Promise<FandomResponse> {
    return this.stats.fandom(genderOf(gender, true)!, seasonOf(season));
  }

  /** GET /prediction/my?season=&limit=50 */
  @Get("my")
  my(
    @DeviceId("required") deviceId: string,
    @Query("season") season?: string,
    @Query("limit") limit?: string,
  ): Promise<MyPredictionsResponse> {
    return this.stats.my(deviceId, seasonOf(season), intOf(limit, 50, 1, 200, "limit"));
  }
}
