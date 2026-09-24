import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "crypto";
import type { Request } from "express";

const MAX_FAILURES = 10; // IP별로 이만큼 틀리면
const LOCK_MS = 10 * 60 * 1000; // 이 시간 동안 막는다

/**
 * 관리자 API 보호. `Authorization: Bearer <ADMIN_TOKEN>`.
 * - ADMIN_TOKEN이 없거나 짧으면(24자 미만) 관리자 기능 자체가 꺼진다 (404)
 * - 틀린 토큰을 IP별로 10번 보내면 10분간 429
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  private readonly failures = new Map<string, { count: number; until: number }>();

  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.ADMIN_TOKEN?.trim() ?? "";
    if (expected.length < 24) throw new NotFoundException();

    const req = ctx.switchToHttp().getRequest<Request>();
    const ip = req.ip ?? "unknown";
    const now = Date.now();
    const f = this.failures.get(ip);
    if (f && f.until > now) throw new HttpException("잠시 후 다시 시도하세요", HttpStatus.TOO_MANY_REQUESTS);

    const header = req.headers.authorization ?? "";
    const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      this.failures.delete(ip);
      return true;
    }
    const count = (f && f.until <= now && f.count >= MAX_FAILURES ? 0 : (f?.count ?? 0)) + 1;
    this.failures.set(ip, { count, until: count >= MAX_FAILURES ? now + LOCK_MS : 0 });
    throw new UnauthorizedException("관리자 토큰이 올바르지 않습니다");
  }
}
