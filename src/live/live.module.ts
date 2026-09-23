import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CacheModule } from "../cache/cache.module";
import { GameModule } from "../game/game.module";
import { ScheduleModule } from "../schedule/schedule.module";
import { LiveController } from "./live.controller";
import { LiveEvent } from "./live-event.entity";
import { LivePollerService } from "./live-poller.service";
import { LiveService } from "./live.service";
import { MatchState } from "./match-state.entity";

@Module({
  imports: [TypeOrmModule.forFeature([LiveEvent, MatchState]), CacheModule, GameModule, ScheduleModule],
  controllers: [LiveController],
  providers: [LiveService, LivePollerService],
  exports: [LiveService],
})
export class LiveModule {}
