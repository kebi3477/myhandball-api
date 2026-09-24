import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from "typeorm";
import type { ReportReason } from "./types";

/** 응원글 신고. 같은 기기가 같은 글을 두 번 신고할 수 없다 */
@Entity({ name: "cheer_reports" })
@Unique(["cheerId", "deviceId"])
export class CheerReport {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "cheer_id", type: "int" })
  cheerId!: number;

  @Column({ name: "device_id", type: "varchar", length: 64 })
  deviceId!: string;

  @Column({ type: "varchar" })
  reason!: ReportReason;

  @Column({ type: "varchar", length: 200, nullable: true })
  detail!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
