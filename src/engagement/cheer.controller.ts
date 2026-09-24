import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Gender } from "../team/types";
import { CheerService } from "./cheer.service";
import { DeviceId } from "./device-id.decorator";
import type { CheerItem, CheerListResponse } from "./types";

function parseGender(gender?: string): Gender | null {
  if (gender === undefined || gender === "") return null;
  if (gender !== "M" && gender !== "W") throw new BadRequestException("gender must be M or W");
  return gender;
}

@Controller("team")
export class CheerController {
  constructor(private readonly cheerService: CheerService) {}

  /** GET /team/132/cheer?gender=M&page=1 — 최신순 20개씩 */
  @Get(":teamNum/cheer")
  list(
    @Param("teamNum", ParseIntPipe) teamNum: number,
    @DeviceId() deviceId: string | null,
    @Query("gender") gender?: string,
    @Query("page") page = "1",
  ): Promise<CheerListResponse> {
    const p = Number(page);
    if (!Number.isInteger(p) || p < 1) throw new BadRequestException("page must be a positive integer");
    return this.cheerService.list(teamNum, parseGender(gender), p, deviceId);
  }

  /** POST /team/132/cheer { text } */
  @Post(":teamNum/cheer")
  @UseGuards(ThrottlerGuard)
  create(
    @Param("teamNum", ParseIntPipe) teamNum: number,
    @DeviceId("required") deviceId: string,
    @Body() body: { text?: unknown },
    @Query("gender") gender?: string,
  ): Promise<CheerItem> {
    return this.cheerService.create(teamNum, parseGender(gender), deviceId, body?.text);
  }

  /** DELETE /team/132/cheer/7 — 본인 글만 */
  @Delete(":teamNum/cheer/:cheerId")
  @UseGuards(ThrottlerGuard)
  remove(
    @Param("teamNum", ParseIntPipe) teamNum: number,
    @Param("cheerId", ParseIntPipe) cheerId: number,
    @DeviceId("required") deviceId: string,
  ): Promise<{ ok: true }> {
    return this.cheerService.remove(teamNum, cheerId, deviceId);
  }

  /** POST /team/132/cheer/7/report { reason, detail? } — 신고. 누적되면 자동 숨김 */
  @Post(":teamNum/cheer/:cheerId/report")
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  report(
    @Param("teamNum", ParseIntPipe) teamNum: number,
    @Param("cheerId", ParseIntPipe) cheerId: number,
    @DeviceId("required") deviceId: string,
    @Body() body: { reason?: unknown; detail?: unknown },
  ): Promise<{ reported: true }> {
    return this.cheerService.report(teamNum, cheerId, deviceId, body ?? {});
  }

  /** POST /team/132/cheer/7/like — 토글 */
  @Post(":teamNum/cheer/:cheerId/like")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  like(
    @Param("teamNum", ParseIntPipe) teamNum: number,
    @Param("cheerId", ParseIntPipe) cheerId: number,
    @DeviceId("required") deviceId: string,
  ): Promise<CheerItem> {
    return this.cheerService.toggleLike(teamNum, cheerId, deviceId);
  }
}
