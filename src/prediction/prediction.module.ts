import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Prediction } from "../engagement/prediction.entity";
import { Profile } from "../profile/profile.entity";
import { ScheduleModule } from "../schedule/schedule.module";
import { TeamListModule } from "../team/team-list.module";
import { PredictionController } from "./prediction.controller";
import { PredictionStatsService } from "./prediction-stats.service";

@Module({
  imports: [TypeOrmModule.forFeature([Prediction, Profile]), ScheduleModule, TeamListModule],
  controllers: [PredictionController],
  providers: [PredictionStatsService],
})
export class PredictionModule {}
