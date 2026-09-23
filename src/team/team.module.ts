import { Module } from "@nestjs/common";
import { TeamController } from "./team.controller";
import { TeamDetailService } from "./team-detail.service";
import { CacheModule } from "src/cache/cache.module";
import { RankingModule } from "../ranking/ranking.module";
import { ScheduleModule } from "../schedule/schedule.module";
import { TeamListModule } from "./team-list.module";

@Module({
  imports: [CacheModule, TeamListModule, RankingModule, ScheduleModule],
  controllers: [TeamController],
  providers: [TeamDetailService],
  exports: [TeamListModule],
})
export class TeamModule {}
