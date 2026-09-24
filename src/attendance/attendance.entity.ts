import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from "typeorm";

/** 직관 기록. 경기 요약(팀·시각·경기장)은 앱이 시즌 일정으로 붙이므로 match_seq만 둔다 */
@Entity({ name: "attendances" })
@Unique(["deviceId", "matchSeq"])
export class Attendance {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "device_id", type: "varchar", length: 64 })
  deviceId!: string;

  @Column({ name: "match_seq", type: "int" })
  matchSeq!: number;

  /** 기록한 시각 */
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
