import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";
import type { PredictionPick } from "./types";

@Entity({ name: "predictions" })
@Unique(["matchSeq", "deviceId"])
export class Prediction {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "match_seq", type: "int" })
  matchSeq!: number;

  @Column({ name: "device_id", type: "varchar", length: 64 })
  deviceId!: string;

  @Column({ type: "varchar" })
  pick!: PredictionPick;

  /** 경기 결과가 확정돼 적중 여부가 정해졌는지 (MatchCatalogService.settle) */
  @Column({ type: "boolean", default: false })
  settled!: boolean;

  /** 적중 여부. settled가 false면 의미 없음 (false) */
  @Column({ type: "boolean", default: false })
  hit!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
