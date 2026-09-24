import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { GameModule } from "../game/game.module";
import { ScheduleModule } from "../schedule/schedule.module";
import { TeamListModule } from "../team/team-list.module";
import { MatchMeta } from "./match-meta.entity";
import { MatchCatalogService } from "./match-catalog.service";

@Module({
  imports: [TypeOrmModule.forFeature([MatchMeta]), ScheduleModule, GameModule, TeamListModule],
  providers: [MatchCatalogService],
  exports: [MatchCatalogService],
})
export class CatalogModule {}
