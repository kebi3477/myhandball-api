import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dbOptions } from './database/db-options';
import { ScheduleModule as CronModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { ScheduleModule } from './schedule/schedule.module';
import { TeamModule } from './team/team.module';
import { RankingModule } from './ranking/ranking.module';
import { WelcomeModule } from './welcome/welcome.module';
import { GameModule } from './game/game.module';
import { PlayerModule } from './player/player.module';
import { LiveModule } from './live/live.module';
import { EngagementModule } from './engagement/engagement.module';
import { PushModule } from './push/push.module';
import { WidgetModule } from './widget/widget.module';
import { PolicyModule } from './policy/policy.module';
import { ProfileModule } from './profile/profile.module';
import { CatalogModule } from './catalog/catalog.module';
import { PredictionModule } from './prediction/prediction.module';
import { AttendanceModule } from './attendance/attendance.module';
import { SyncModule } from './sync/sync.module';
import { AppVersionModule } from './app-version/app-version.module';
import { AdminModule } from './admin/admin.module';
import { SeasonModule } from './season/season.module';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      // 스키마는 마이그레이션으로만 바꾼다 (src/database/db-options.ts 참고).
      // 기동할 때 아직 적용하지 않은 마이그레이션을 실행한다
      useFactory: () => ({
        ...dbOptions(),
        autoLoadEntities: true,
        migrationsRun: true,
      }),
    }),
    CronModule.forRoot(),
    // 쓰기 엔드포인트에만 건다 (@UseGuards(ThrottlerGuard)). IP 기준 분당 30회
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    ScheduleModule,
    TeamModule,
    RankingModule,
    WelcomeModule,
    GameModule,
    PlayerModule,
    LiveModule,
    EngagementModule,
    PushModule,
    WidgetModule,
    PolicyModule,
    ProfileModule,
    CatalogModule,
    PredictionModule,
    AttendanceModule,
    SyncModule,
    AppVersionModule,
    AdminModule,
    SeasonModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
