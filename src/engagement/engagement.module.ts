import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CacheModule } from "../cache/cache.module";
import { CatalogModule } from "../catalog/catalog.module";
import { GameModule } from "../game/game.module";
import { MatchState } from "../live/match-state.entity";
import { PlayerModule } from "../player/player.module";
import { TeamModule } from "../team/team.module";
import { Block } from "./block.entity";
import { BlockController } from "./block.controller";
import { BlockService } from "./block.service";
import { CheerLike } from "./cheer-like.entity";
import { CheerReport } from "./cheer-report.entity";
import { CheerController } from "./cheer.controller";
import { Cheer } from "./cheer.entity";
import { CheerService } from "./cheer.service";
import { GameEngagementController } from "./game-engagement.controller";
import { GameEngagementService } from "./game-engagement.service";
import { MvpVote } from "./mvp-vote.entity";
import { Prediction } from "./prediction.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([Prediction, MvpVote, Cheer, CheerLike, CheerReport, Block, MatchState]),
    CacheModule,
    CatalogModule,
    GameModule,
    PlayerModule,
    TeamModule,
  ],
  controllers: [GameEngagementController, CheerController, BlockController],
  providers: [GameEngagementService, CheerService, BlockService],
})
export class EngagementModule {}
