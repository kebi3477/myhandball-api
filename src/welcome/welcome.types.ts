import type { Gender } from '../team/types';

export type WelcomeSubmissionDto = {
  userGender: Gender;
  ageGroup: string;
  teamGender: Gender;
  teamNum?: number | null;
  teamName?: string | null;
  teamLogoUrl?: string | null;
};
