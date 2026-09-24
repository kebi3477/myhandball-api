import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

/** 핸드볼 입문 가이드 진행도. 값은 올라가기만 하고, 수료일은 처음 한 번만 정해진다 */
@Entity({ name: "guide_progress" })
export class GuideProgress {
  @PrimaryColumn({ name: "device_id", type: "varchar", length: 64 })
  deviceId!: string;

  @Column({ name: "done_count", type: "int", default: 0 })
  doneCount!: number;

  /** 5를 처음 채운 시각 (배지 획득일). 한 번 정해지면 바뀌지 않는다 */
  @Column({ name: "completed_at", type: "timestamptz", nullable: true })
  completedAt!: Date | null;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
