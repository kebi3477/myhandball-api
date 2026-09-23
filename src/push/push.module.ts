import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TeamModule } from "../team/team.module";
import { PushController } from "./push.controller";
import { PushLog } from "./push-log.entity";
import { PushToken } from "./push-token.entity";
import { PushService } from "./push.service";

@Module({
  imports: [TypeOrmModule.forFeature([PushToken, PushLog]), TeamModule],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
