import { BadRequestException, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Put, Query, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { currentSeason } from "../common/season";
import { DeviceId } from "../engagement/device-id.decorator";
import { AttendanceService } from "./attendance.service";
import type { AttendanceItem, AttendanceResponse } from "./types";

@Controller("attendance")
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  /** GET /attendance?season=2025 — 내 직관 기록 */
  @Get()
  list(@DeviceId("required") deviceId: string, @Query("season") season?: string): Promise<AttendanceResponse> {
    const s = season?.trim() || currentSeason();
    if (!/^\d{4}$/.test(s)) throw new BadRequestException("season은 시작 연도(예: 2025)여야 해요");
    return this.attendanceService.list(deviceId, s);
  }

  /** PUT /attendance/:matchSeq — 멱등, 끝난 경기만 */
  @Put(":matchSeq")
  @UseGuards(ThrottlerGuard)
  put(@DeviceId("required") deviceId: string, @Param("matchSeq", ParseIntPipe) matchSeq: number): Promise<AttendanceItem> {
    return this.attendanceService.put(deviceId, matchSeq);
  }

  /** DELETE /attendance/:matchSeq — 없어도 204 */
  @Delete(":matchSeq")
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  async remove(@DeviceId("required") deviceId: string, @Param("matchSeq", ParseIntPipe) matchSeq: number): Promise<void> {
    await this.attendanceService.remove(deviceId, matchSeq);
  }
}
