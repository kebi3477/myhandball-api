import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule as CronModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { ScheduleModule } from './schedule/schedule.module';
import { TeamModule } from './team/team.module';
import { RankingModule } from './ranking/ranking.module';
import { WelcomeModule } from './welcome/welcome.module';
import { GameModule } from './game/game.module';
import { PlayerModule } from './player/player.module';
import { LiveModule } from './live/live.module';

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
    ScheduleModule,
    TeamModule,
    RankingModule,
    WelcomeModule,
    GameModule,
    PlayerModule,
    LiveModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
