import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { WelcomeSubmissionDto } from './welcome.types';
import { WelcomeSubmission } from './welcome.entity';

@Injectable()
export class WelcomeService {
  constructor(
    @InjectRepository(WelcomeSubmission)
    private readonly welcomeRepo: Repository<WelcomeSubmission>,
  ) {}

  async saveSubmission(submission: WelcomeSubmissionDto): Promise<void> {
    const entity = this.welcomeRepo.create({
      userGender: submission.userGender,
      ageGroup: submission.ageGroup,
      teamGender: submission.teamGender,
      teamNum: submission.teamNum ?? null,
      teamName: submission.teamName ?? null,
      teamLogoUrl: submission.teamLogoUrl ?? null,
    });

    await this.welcomeRepo.save(entity);
  }
}
