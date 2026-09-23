import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";
import type { MatchStatus } from "./types";

@Entity({ name: "match_states" })
export class MatchState {
  @PrimaryColumn({ name: "match_seq", type: "int" })
  matchSeq!: number;

  @Column({ type: "varchar" })
  status!: MatchStatus;

  @Column({ name: "score_home", type: "int", nullable: true })
  scoreHome!: number | null;

  @Column({ name: "score_away", type: "int", nullable: true })
  scoreAway!: number | null;

  @Column({ name: "starts_at", type: "timestamptz", nullable: true })
  startsAt!: Date | null;

  /** 마지막으로 PBP에 새 행이 생긴 시각 */
  @Column({ name: "last_change_at", type: "timestamptz", nullable: true })
  lastChangeAt!: Date | null;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
