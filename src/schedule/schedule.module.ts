import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CacheModule } from "../cache/cache.module";
import { MatchState } from "../live/match-state.entity";
import { ScheduleController } from "./schedule.controller";
import { ScheduleService } from "./schedule.service";

@Module({
  imports: [CacheModule, TypeOrmModule.forFeature([MatchState])],
  controllers: [ScheduleController],
  providers: [ScheduleService],
  exports: [ScheduleService],
})
export class ScheduleModule {}
