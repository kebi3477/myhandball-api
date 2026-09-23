import { Controller, Get, Query } from "@nestjs/common";
import { TeamService } from "./team.service";
import { TeamListResponse, Gender } from "./types";

@Controller("team")
export class TeamController {
  constructor(
    private readonly teamService: TeamService,
  ) {}

  @Get()
  async getTeams(
    @Query("gender") gender: Gender = "W"
  ): Promise<TeamListResponse> {
    const g: Gender = gender === "M" ? "M" : "W";

    return this.teamService.fetchTeams(g);
  }
}
