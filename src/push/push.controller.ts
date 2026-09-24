import { Body, Controller, Delete, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { DeviceId } from "../engagement/device-id.decorator";
import { PushService } from "./push.service";
import type { PushRegisterResponse, PushTestResponse } from "./types";

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

  /**
   * POST /push/test — 그 기기(X-Device-Id)에게만 테스트 알림 1건. 기기당 1분에 1회.
   * 드라이런이면 보내지 않고 200 { sent: false, dryRun: true }
   */
  @Post("test")
  @HttpCode(200)
  test(@DeviceId("required") deviceId: string): Promise<PushTestResponse> {
    return this.pushService.sendTest(deviceId);
  }

  /** DELETE /push/register — 구독 해제 (X-Device-Id 기준) */
  @Delete("register")
  unregister(@DeviceId("required") deviceId: string): Promise<{ ok: true }> {
    return this.pushService.unregister(deviceId);
  }
}
