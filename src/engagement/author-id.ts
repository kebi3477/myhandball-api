import { Logger } from "@nestjs/common";
import { createHmac } from "crypto";

const DEV_SECRET = "myhandball-dev-author-secret";
let warned = false;

/**
 * 응원글 작성자 식별자: HMAC-SHA256(기기 ID, AUTHOR_ID_SECRET)의 앞 16자.
 * 같은 기기는 늘 같은 값이 되고(차단에 쓴다), 이 값으로 기기 ID를 되돌릴 수는 없다.
 * **AUTHOR_ID_SECRET은 한 번 정하면 바꾸지 않는다** — 바꾸면 모든 작성자 ID와 차단 목록이 어긋난다
 */
export function authorIdOf(deviceId: string): string {
  let secret = process.env.AUTHOR_ID_SECRET?.trim();
  if (!secret) {
    if (!warned) {
      warned = true;
      new Logger("AuthorId").warn("AUTHOR_ID_SECRET 없음 — 개발용 기본값 사용. 운영에서는 반드시 설정할 것");
    }
    secret = DEV_SECRET;
  }
  return createHmac("sha256", secret).update(deviceId).digest("hex").slice(0, 16);
}

export const AUTHOR_ID_RE = /^[0-9a-f]{16}$/;
