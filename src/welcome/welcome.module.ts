import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WelcomeController } from './welcome.controller';
import { WelcomeService } from './welcome.service';
import { WelcomeSubmission } from './welcome.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WelcomeSubmission])],
  controllers: [WelcomeController],
  providers: [WelcomeService],
})
export class WelcomeModule {}
