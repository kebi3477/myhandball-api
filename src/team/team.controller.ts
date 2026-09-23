import { BadRequestException, Controller, Get, Param, ParseIntPipe, Query } from "@nestjs/common";
import { TeamService } from "./team.service";
import { TeamDetailService } from "./team-detail.service";
import { TeamListResponse, Gender, TeamDetailResponse } from "./types";

@Controller("team")
export class TeamController {
  constructor(
    private readonly teamService: TeamService,
    private readonly teamDetailService: TeamDetailService,
  ) {}

  @Get()
  async getTeams(
    @Query("gender") gender: Gender = "W"
  ): Promise<TeamListResponse> {
    const g: Gender = gender === "M" ? "M" : "W";

    return this.teamService.fetchTeams(g);
  }

  /**
   * GET /team/132?gender=M&season=2025&type=1
   * gender를 생략하면 남녀 팀 목록에서 teamNum으로 찾는다
   */
  @Get(":teamNum")
  async getTeam(
    @Param("teamNum", ParseIntPipe) teamNum: number,
    @Query("gender") gender?: string,
    @Query("season") season = "2025",
    @Query("type") type = "1",
  ): Promise<TeamDetailResponse> {
    if (gender !== undefined && gender !== "M" && gender !== "W") {
      throw new BadRequestException("gender must be M or W");
    }
    return this.teamDetailService.fetchDetail(teamNum, (gender as Gender) ?? null, season, type);
  }
}
