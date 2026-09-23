import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { WelcomeService } from './welcome.service';
import type { WelcomeSubmissionDto } from './welcome.types';
import type { Gender } from '../team/types';

function isGender(value: string): value is Gender {
  return value === 'M' || value === 'W';
}

@Controller('welcome')
export class WelcomeController {
  constructor(private readonly welcomeService: WelcomeService) {}

  @Post('submissions')
  async submitWelcome(@Body() body: WelcomeSubmissionDto) {
    if (!isGender(body.userGender) || !isGender(body.teamGender)) {
      throw new BadRequestException('gender must be M or W');
    }

    if (!body.ageGroup) {
      throw new BadRequestException('ageGroup is required');
    }

    await this.welcomeService.saveSubmission({
      ...body,
      teamNum: body.teamNum ?? null,
      teamName: body.teamName ?? null,
      teamLogoUrl: body.teamLogoUrl ?? null,
    });

    return { ok: true };
  }
}
