import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import type { Gender } from "../team/types";

@Entity({ name: "cheers" })
@Index(["teamNum", "createdAt"])
export class Cheer {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "team_num", type: "int" })
  teamNum!: number;

  @Column({ type: "varchar" })
  gender!: Gender;

  @Index()
  @Column({ name: "device_id", type: "varchar", length: 64 })
  deviceId!: string;

  @Column({ type: "varchar", length: 200 })
  text!: string;

  @Column({ type: "int", default: 0 })
  likes!: number;

  /** 신고·차단용. true면 목록에서 빠진다 (지금은 DB에서 수동으로 켠다) */
  @Column({ type: "boolean", default: false })
  hidden!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
