import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LiveEvent } from "../live/live-event.entity";
import { ScheduleModule } from "../schedule/schedule.module";
import { TeamModule } from "../team/team.module";
import { WidgetController } from "./widget.controller";
import { WidgetService } from "./widget.service";

@Module({
  imports: [TypeOrmModule.forFeature([LiveEvent]), ScheduleModule, TeamModule],
  controllers: [WidgetController],
  providers: [WidgetService],
})
export class WidgetModule {}
