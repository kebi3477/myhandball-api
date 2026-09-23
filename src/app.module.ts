import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { ScheduleModule } from './schedule/schedule.module';
import { TeamModule } from './team/team.module';
import { RankingModule } from './ranking/ranking.module';
import { WelcomeModule } from './welcome/welcome.module';

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
    ScheduleModule,
    TeamModule,
    RankingModule,
    WelcomeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
