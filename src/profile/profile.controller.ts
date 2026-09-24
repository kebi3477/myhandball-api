import { Body, Controller, Delete, Get, HttpCode, Put, Res, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Response } from "express";
import { DeviceId } from "../engagement/device-id.decorator";
import { ProfileService } from "./profile.service";
import type { ProfileResponse } from "./types";

@Controller("profile")
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  /**
   * GET /profile — 없으면 404가 아니라 200 + `null`.
   * 앱이 "아직 안 만들었다"와 "서버가 죽었다"를 구분해야 한다.
   * (Nest는 null을 빈 본문으로 보내므로 JSON `null`을 직접 쓴다)
   */
  @Get()
  async get(@DeviceId("required") deviceId: string, @Res() res: Response): Promise<void> {
    const profile = await this.profileService.get(deviceId);
    res.status(200).type("application/json").send(JSON.stringify(profile));
  }

  /** PUT /profile { nickname, teamNum, gender } */
  @Put()
  @UseGuards(ThrottlerGuard)
  upsert(@DeviceId("required") deviceId: string, @Body() body: Record<string, unknown>): Promise<ProfileResponse> {
    return this.profileService.upsert(deviceId, body ?? {});
  }

  /** DELETE /profile — 없어도 204 */
  @Delete()
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  async remove(@DeviceId("required") deviceId: string): Promise<void> {
    await this.profileService.remove(deviceId);
  }
}
