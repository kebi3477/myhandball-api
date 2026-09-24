import { Module } from "@nestjs/common";
import { ScheduleModule } from "../schedule/schedule.module";
import { SeasonController } from "./season.controller";
import { SeasonService } from "./season.service";

@Module({
  imports: [ScheduleModule],
  controllers: [SeasonController],
  providers: [SeasonService],
})
export class SeasonModule {}
