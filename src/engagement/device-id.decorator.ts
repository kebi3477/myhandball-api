import { BadRequestException, createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

// 앱이 기기별로 한 번 만들어 저장하는 난수 UUID. 개인정보가 아니며 중복 투표 방지에만 쓴다
const DEVICE_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/**
 * X-Device-Id 헤더.
 * - `DeviceId()`: 없으면 null (조회용)
 * - `DeviceId("required")`: 없거나 형식이 틀리면 400 (쓰기용)
 * 형식이 틀린 값은 조회에서도 없는 것으로 본다
 */
export const DeviceId = createParamDecorator((mode: "required" | undefined, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const raw = req.headers["x-device-id"];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  if (DEVICE_ID_RE.test(value)) return value;
  if (mode === "required") {
    throw new BadRequestException("X-Device-Id 헤더가 필요합니다 (영문·숫자·하이픈 8~64자)");
  }
  return null;
});
