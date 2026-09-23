import { Module } from "@nestjs/common";
import { CacheModule } from "../cache/cache.module";
import { GameController } from "./game.controller";
import { GameService } from "./game.service";

@Module({
  imports: [CacheModule],
  controllers: [GameController],
  providers: [GameService],
  exports: [GameService],
})
export class GameModule {}
