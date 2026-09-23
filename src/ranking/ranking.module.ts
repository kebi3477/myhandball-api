import { Module } from "@nestjs/common";
import { TeamListModule } from "../team/team-list.module";
import { RankingService } from "./ranking.service";
import { RankingController } from "./ranking.controller";

@Module({
  imports: [TeamListModule],
  controllers: [RankingController],
  providers: [RankingService],
  exports: [RankingService],
})
export class RankingModule {}
