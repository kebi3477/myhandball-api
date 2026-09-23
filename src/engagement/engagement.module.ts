import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CacheModule } from "../cache/cache.module";
import { GameModule } from "../game/game.module";
import { MatchState } from "../live/match-state.entity";
import { PlayerModule } from "../player/player.module";
import { TeamModule } from "../team/team.module";
import { CheerLike } from "./cheer-like.entity";
import { CheerController } from "./cheer.controller";
import { Cheer } from "./cheer.entity";
import { CheerService } from "./cheer.service";
import { GameEngagementController } from "./game-engagement.controller";
import { GameEngagementService } from "./game-engagement.service";
import { MvpVote } from "./mvp-vote.entity";
import { Prediction } from "./prediction.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([Prediction, MvpVote, Cheer, CheerLike, MatchState]),
    // 쓰기 엔드포인트에만 걸린다 (@UseGuards(ThrottlerGuard)). IP 기준 분당 30회
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    CacheModule,
    GameModule,
    PlayerModule,
    TeamModule,
  ],
  controllers: [GameEngagementController, CheerController],
  providers: [GameEngagementService, CheerService],
})
export class EngagementModule {}
