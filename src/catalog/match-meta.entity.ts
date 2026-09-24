import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from "typeorm";
import type { Gender } from "../team/types";

export type MatchResult = "home" | "draw" | "away";

/**
 * 경기 카탈로그. 예측·직관 기록은 match_seq만 들고 있어서, 시즌·부·시각·팀·최종 결과를
 * 여기서 붙인다. 일정(ScheduleService)에서 채우고, 일정에 없는 경기는 경기 상세에서 채운다
 */
@Entity({ name: "match_meta" })
@Index(["season", "gender"])
export class MatchMeta {
  @PrimaryColumn({ name: "match_seq", type: "int" })
  matchSeq!: number;

  /** 시작 연도 ("2025" = 25-26 시즌) */
  @Column({ type: "varchar", length: 4 })
  season!: string;

  @Column({ type: "varchar" })
  gender!: Gender;

  /** "1" 정규리그 / "2" 포스트시즌. 상세에서 채운 경우 null */
  @Column({ name: "league_type", type: "varchar", nullable: true })
  leagueType!: string | null;

  @Column({ name: "starts_at", type: "timestamptz", nullable: true })
  startsAt!: Date | null;

  @Column({ name: "home_name", type: "text" })
  homeName!: string;

  @Column({ name: "away_name", type: "text" })
  awayName!: string;

  @Column({ name: "home_logo_url", type: "text", nullable: true })
  homeLogoUrl!: string | null;

  @Column({ name: "away_logo_url", type: "text", nullable: true })
  awayLogoUrl!: string | null;

  @Column({ type: "text", nullable: true })
  venue!: string | null;

  @Column({ name: "score_home", type: "int", nullable: true })
  scoreHome!: number | null;

  @Column({ name: "score_away", type: "int", nullable: true })
  scoreAway!: number | null;

  /** 경기 종료 + 최종 점수 확정일 때만 채운다. 연기·미기록 경기는 null */
  @Column({ type: "varchar", nullable: true })
  result!: MatchResult | null;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
