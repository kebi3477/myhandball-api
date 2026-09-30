import { Module } from "@nestjs/common";
import { CacheModule } from "../cache/cache.module";
import { TeamListModule } from "../team/team-list.module";
import { RecordController } from "./record.controller";
import { RecordService } from "./record.service";

@Module({
  imports: [CacheModule, TeamListModule],
  controllers: [RecordController],
  providers: [RecordService],
})
export class RecordModule {}
