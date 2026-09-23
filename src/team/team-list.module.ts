import { Module } from "@nestjs/common";
import { CacheModule } from "../cache/cache.module";
import { TeamService } from "./team.service";

/**
 * TeamService(팀 목록·팀 이름 정본)만 담은 모듈.
 * TeamModule이 일정·순위 모듈을 쓰고, 일정·순위는 팀 이름 정규화에 TeamService를 쓰므로
 * 순환을 피하려고 따로 뺐다
 */
@Module({
  imports: [CacheModule],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamListModule {}
