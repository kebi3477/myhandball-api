import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { Gender } from '../team/types';

@Entity({ name: 'welcome_submissions' })
export class WelcomeSubmission {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_gender', type: 'text' })
  userGender!: Gender;

  @Column({ name: 'age_group', type: 'text' })
  ageGroup!: string;

  @Column({ name: 'team_gender', type: 'text' })
  teamGender!: Gender;

  @Column({ name: 'team_num', type: 'int', nullable: true })
  teamNum!: number | null;

  @Column({ name: 'team_name', type: 'text', nullable: true })
  teamName!: string | null;

  @Column({ name: 'team_logo_url', type: 'text', nullable: true })
  teamLogoUrl!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
