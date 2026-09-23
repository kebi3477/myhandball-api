import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        ssl:
          process.env.DATABASE_SSL === 'true'
            ? {
                rejectUnauthorized: false,
              }
            : false,
        autoLoadEntities: true,
        synchronize: true,
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
