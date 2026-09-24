import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { Gender } from "../team/types";

/** 기기별 공개 프로필 (승부예측 랭킹에 닉네임으로 뜬다) */
@Entity({ name: "profiles" })
export class Profile {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ name: "device_id", type: "varchar", length: 64 })
  deviceId!: string;

  @Column({ type: "varchar", length: 40 })
  nickname!: string;

  /** 중복 검사 키: 소문자 + 공백 제거. unique라 동시 요청에도 하나만 들어간다 */
  @Index({ unique: true })
  @Column({ name: "nickname_key", type: "varchar", length: 40 })
  nicknameKey!: string;

  /** 응원팀 (/api/team 의 teamNum) */
  @Index()
  @Column({ name: "team_num", type: "int" })
  teamNum!: number;

  @Column({ type: "varchar" })
  gender!: Gender;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
