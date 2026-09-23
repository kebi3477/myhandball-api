import { Module } from "@nestjs/common";
import { TeamController } from "./team.controller";
import { TeamService } from "./team.service";
import { TeamDetailService } from "./team-detail.service";
import { CacheModule } from "src/cache/cache.module";
import { RankingModule } from "../ranking/ranking.module";
import { ScheduleModule } from "../schedule/schedule.module";

@Module({
  imports: [CacheModule, RankingModule, ScheduleModule],
  controllers: [TeamController],
  providers: [TeamService, TeamDetailService],
  exports: [TeamService],
})
export class TeamModule {}
