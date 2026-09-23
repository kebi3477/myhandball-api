import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";
import type { PushKind } from "./types";

/**
 * 경기당 한 번만 보내야 하는 알림(시작 전·종료)의 발송 기록.
 * 서버가 경기 도중 재시작돼도 같은 알림을 두 번 보내지 않게 한다
 */
@Entity({ name: "push_logs" })
@Unique(["matchSeq", "kind"])
export class PushLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "match_seq", type: "int" })
  matchSeq!: number;

  @Column({ type: "varchar" })
  kind!: PushKind;

  @Column({ type: "int" })
  recipients!: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
