import { Logger } from "@nestjs/common";
import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { Messaging, getMessaging } from "firebase-admin/messaging";

/**
 * FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY가 모두 있으면 Messaging을 만든다.
 * 하나라도 없으면 null → 푸시 모듈은 발송 대신 로그만 남긴다 (드라이런)
 */
export function createMessaging(logger: Logger): Messaging | null {
  const projectId = process.env.FCM_PROJECT_ID?.trim();
  const clientEmail = process.env.FCM_CLIENT_EMAIL?.trim();
  // .env에서는 개행을 "\n" 두 글자로 적는 경우가 많다
  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!projectId || !clientEmail || !privateKey) {
    logger.log("FCM 자격증명 없음 — 드라이런 모드 (발송 대신 로그)");
    return null;
  }
  try {
    const app: App =
      getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    return getMessaging(app);
  } catch (e) {
    logger.error(`FCM 초기화 실패 — 드라이런 모드로 동작: ${e}`);
    return null;
  }
}
