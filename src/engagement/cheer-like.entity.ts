import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity({ name: "cheer_likes" })
@Unique(["cheerId", "deviceId"])
export class CheerLike {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "cheer_id", type: "int" })
  cheerId!: number;

  @Column({ name: "device_id", type: "varchar", length: 64 })
  deviceId!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
