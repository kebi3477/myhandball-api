import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { BlockService } from "./block.service";
import { DeviceId } from "./device-id.decorator";
import type { BlockItem, BlockListResponse } from "./types";

@Controller("block")
export class BlockController {
  constructor(private readonly blockService: BlockService) {}

  /** POST /block { authorId } — 그 작성자의 응원글을 내 목록에서 뺀다 */
  @Post()
  @UseGuards(ThrottlerGuard)
  block(@DeviceId("required") deviceId: string, @Body() body: { authorId?: unknown }): Promise<BlockItem> {
    return this.blockService.block(deviceId, body?.authorId);
  }

  /** DELETE /block/:authorId — 없어도 204 */
  @Delete(":authorId")
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  async unblock(@DeviceId("required") deviceId: string, @Param("authorId") authorId: string): Promise<void> {
    await this.blockService.unblock(deviceId, authorId);
  }

  /** GET /block — 내가 차단한 작성자 */
  @Get()
  list(@DeviceId("required") deviceId: string): Promise<BlockListResponse> {
    return this.blockService.list(deviceId);
  }
}
