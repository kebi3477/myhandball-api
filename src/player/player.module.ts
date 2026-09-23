import { Module } from "@nestjs/common";
import { CacheModule } from "../cache/cache.module";
import { TeamModule } from "../team/team.module";
import { PlayerController } from "./player.controller";
import { PlayerService } from "./player.service";

@Module({
  imports: [CacheModule, TeamModule],
  controllers: [PlayerController],
  providers: [PlayerService],
  exports: [PlayerService],
})
export class PlayerModule {}
