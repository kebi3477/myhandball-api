import { Module } from "@nestjs/common";
import { TeamController } from "./team.controller";
import { TeamService } from "./team.service";
import { CacheModule } from "src/cache/cache.module";

@Module({
  imports: [CacheModule],
  controllers: [TeamController],
  providers: [TeamService],
})
export class TeamModule {}
