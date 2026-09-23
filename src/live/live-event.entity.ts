import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import type { LiveEventType } from "./types";

/** playbyplay.php 한 행. 폴링 때마다 원본과 맞춰 갱신하고, 처음 본 시각(observedAt)은 유지한다 */
@Entity({ name: "live_events" })
@Index(["matchSeq", "rowKey"], { unique: true })
export class LiveEvent {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "match_seq", type: "int" })
  matchSeq!: number;

  /** half|clock|homeText|awayText — 같은 행을 알아보는 키 */
  @Column({ name: "row_key", type: "text" })
  rowKey!: string;

  @Column({ type: "int" })
  half!: number;

  @Column({ type: "int" })
  seq!: number;

  @Column({ type: "text" })
  clock!: string;

  /** 경기 전체 기준 경과 분 (원본 경기 시계로 계산) */
  @Column({ type: "int" })
  minute!: number;

  @Column({ name: "score_home", type: "int" })
  scoreHome!: number;

  @Column({ name: "score_away", type: "int" })
  scoreAway!: number;

  @Column({ name: "scored_by", type: "varchar", nullable: true })
  scoredBy!: "home" | "away" | null;

  @Column({ type: "varchar" })
  type!: LiveEventType;

  @Column({ type: "varchar", nullable: true })
  side!: "home" | "away" | null;

  @Column({ name: "player_number", type: "int", nullable: true })
  playerNumber!: number | null;

  @Column({ name: "player_name", type: "text", nullable: true })
  playerName!: string | null;

  @Column({ type: "text" })
  action!: string;

  @Column({ name: "assist_number", type: "int", nullable: true })
  assistNumber!: number | null;

  @Column({ name: "assist_name", type: "text", nullable: true })
  assistName!: string | null;

  @Column({ name: "home_text", type: "text" })
  homeText!: string;

  @Column({ name: "away_text", type: "text" })
  awayText!: string;

  /** 폴링으로 처음 본 시각. 경기 종료 후 한꺼번에 받은 기록은 null */
  @Column({ name: "observed_at", type: "timestamptz", nullable: true })
  observedAt!: Date | null;
}
