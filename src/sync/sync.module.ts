import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FavoritePlayer } from "./favorite-player.entity";
import { GuideProgress } from "./guide-progress.entity";
import { SyncController } from "./sync.controller";
import { SyncService } from "./sync.service";

@Module({
  imports: [TypeOrmModule.forFeature([FavoritePlayer, GuideProgress])],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
