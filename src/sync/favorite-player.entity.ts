import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from "typeorm";

/** 관심 선수. 선수 이름·팀은 앱이 /api/player로 붙이므로 player_seq만 둔다 */
@Entity({ name: "favorite_players" })
@Unique(["deviceId", "playerSeq"])
export class FavoritePlayer {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "device_id", type: "varchar", length: 64 })
  deviceId!: string;

  @Column({ name: "player_seq", type: "int" })
  playerSeq!: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
