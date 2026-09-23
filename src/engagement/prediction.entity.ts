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

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
