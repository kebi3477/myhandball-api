import { Body, Controller, Delete, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { DeviceId } from "../engagement/device-id.decorator";
import { PushService } from "./push.service";
import type { PushRegisterResponse } from "./types";

@Controller("push")
@UseGuards(ThrottlerGuard)
export class PushController {
  constructor(private readonly pushService: PushService) {}

  /** POST /push/register { token, platform, teamNum, gender } — 같은 기기는 덮어쓰기 */
  @Post("register")
  @HttpCode(200)
  register(@DeviceId("required") deviceId: string, @Body() body: Record<string, unknown>): Promise<PushRegisterResponse> {
    return this.pushService.register(deviceId, body ?? {});
  }

  /** DELETE /push/register — 구독 해제 (X-Device-Id 기준) */
  @Delete("register")
  unregister(@DeviceId("required") deviceId: string): Promise<{ ok: true }> {
    return this.pushService.unregister(deviceId);
  }
}
