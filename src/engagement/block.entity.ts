import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from "typeorm";

/** 기기 단위 차단. 차단한 작성자의 응원글은 그 기기의 목록에서 빠진다 */
@Entity({ name: "blocks" })
@Unique(["deviceId", "authorId"])
export class Block {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "device_id", type: "varchar", length: 64 })
  deviceId!: string;

  @Column({ name: "author_id", type: "varchar", length: 16 })
  authorId!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
