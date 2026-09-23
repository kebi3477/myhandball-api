import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity({ name: "mvp_votes" })
@Unique(["matchSeq", "deviceId"])
export class MvpVote {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "match_seq", type: "int" })
  matchSeq!: number;

  @Column({ name: "device_id", type: "varchar", length: 64 })
  deviceId!: string;

  /** 선수 API(/api/player)의 player_seq. 로스터에서 선수를 특정할 수 없으면 null이고 이름으로 센다 */
  @Column({ name: "player_seq", type: "int", nullable: true })
  playerSeq!: number | null;

  @Column({ name: "player_name", type: "text" })
  playerName!: string;

  /** 같은 이름의 선수를 구분하기 위한 소속 ("home" | "away") */
  @Column({ type: "varchar" })
  side!: "home" | "away";

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
