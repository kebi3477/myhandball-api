import { Column, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";
import type { Gender } from "../team/types";

@Entity({ name: "push_tokens" })
@Unique(["deviceId"])
export class PushToken {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "device_id", type: "varchar", length: 64 })
  deviceId!: string;

  /** FCM 등록 토큰 */
  @Column({ type: "text" })
  token!: string;

  @Column({ type: "varchar" })
  platform!: "ios" | "android";

  /** 마이팀. null이면 팀 알림을 받지 않는다 */
  @Index()
  @Column({ name: "team_num", type: "int", nullable: true })
  teamNum!: number | null;

  @Column({ type: "varchar" })
  gender!: Gender;

  /** FCM이 무효 토큰이라고 답하면 false로 끈다 */
  @Column({ type: "boolean", default: true })
  enabled!: boolean;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
