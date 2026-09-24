import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { TeamService } from "../team/team.service";
import type { Gender, TeamItem } from "../team/types";
import { nicknameError, nicknameKey } from "./nickname";
import { Profile } from "./profile.entity";
import type { ProfileResponse } from "./types";

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
    private readonly teamService: TeamService,
  ) {}

  /** 팀 목록(정본)에서 팀을 찾는다. 부가 맞지 않거나 없으면 null */
  async team(teamNum: number, gender: Gender): Promise<TeamItem | null> {
    const teams = (await this.teamService.fetchTeams(gender)).teams;
    return teams.find((t) => t.teamNum === teamNum) ?? null;
  }

  async toResponse(p: Profile): Promise<ProfileResponse> {
    const team = await this.team(p.teamNum, p.gender).catch(() => null);
    return {
      nickname: p.nickname,
      teamNum: p.teamNum,
      teamName: team?.name ?? "",
      teamLogoUrl: team?.logoUrl ?? null,
      gender: p.gender,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  findByDevice(deviceId: string): Promise<Profile | null> {
    return this.profiles.findOne({ where: { deviceId } });
  }

  async get(deviceId: string): Promise<ProfileResponse | null> {
    const p = await this.findByDevice(deviceId);
    return p ? this.toResponse(p) : null;
  }

  async upsert(deviceId: string, body: Record<string, unknown>): Promise<ProfileResponse> {
    const err = nicknameError(body.nickname);
    if (err) throw new BadRequestException(err);
    const nickname = (body.nickname as string).trim();
    const gender = body.gender;
    if (gender !== "M" && gender !== "W") throw new BadRequestException("gender는 M 또는 W여야 해요");
    const teamNum = Number(body.teamNum);
    if (!Number.isInteger(teamNum)) throw new BadRequestException("teamNum이 필요해요");
    if (!(await this.team(teamNum, gender))) throw new NotFoundException(`팀을 찾을 수 없습니다: ${teamNum}`);

    const key = nicknameKey(nickname);
    const taken = await this.profiles.findOne({ where: { nicknameKey: key } });
    // 자기 자신의 현재 닉네임으로 다시 저장하는 건 충돌이 아니다
    if (taken && taken.deviceId !== deviceId) throw new ConflictException("이미 사용 중인 닉네임이에요");

    const existing = await this.findByDevice(deviceId);
    const entity = existing
      ? Object.assign(existing, { nickname, nicknameKey: key, teamNum, gender })
      : this.profiles.create({ deviceId, nickname, nicknameKey: key, teamNum, gender });
    try {
      return this.toResponse(await this.profiles.save(entity));
    } catch (e) {
      // 동시에 같은 닉네임이 들어온 경우 (unique 제약)
      if (e instanceof QueryFailedError && (e as any).driverError?.code === "23505") {
        throw new ConflictException("이미 사용 중인 닉네임이에요");
      }
      throw e;
    }
  }

  async remove(deviceId: string): Promise<void> {
    await this.profiles.delete({ deviceId });
  }
}
