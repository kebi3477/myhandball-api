import { BadRequestException, Controller, Get, Header, Logger, NotFoundException, Query } from "@nestjs/common";

type Platform = "ios" | "android";

export interface AppVersionResponse {
  platform: Platform;
  latestVersion: string; // "1.2.0" — 표시 버전, 빌드 번호 없음
  minVersion: string | null; // 이 아래는 못 쓰게 할 최소 버전. 기본 null (앱은 아직 쓰지 않는다)
  storeUrl: string;
  notes: string | null; // 안내에 띄울 한 줄
}

// 스토어 주소 기본값. iOS는 앱 ID를 알아야 해서 환경변수로만 받는다
const DEFAULT_STORE_URL: Record<Platform, string | null> = {
  android: "https://play.google.com/store/apps/details?id=com.myhandball.app",
  ios: null,
};

/** "1.2.0+7" → "1.2.0". 숫자.숫자 형식이 아니면 null */
function normalizeVersion(raw?: string): string | null {
  const v = raw?.trim().split("+")[0];
  return v && /^\d+(\.\d+){0,3}$/.test(v) ? v : null;
}

/**
 * 앱 업데이트 안내용 최신 버전. Play 스토어에는 iTunes Lookup 같은 공개 API가 없어서 서버가 알려 준다.
 * 값은 환경변수로 관리한다 (APP_{ANDROID|IOS}_LATEST_VERSION 등). 설정이 없으면 404 — 앱은 안내를 띄우지 않는다
 */
@Controller("app")
export class AppVersionController {
  private readonly logger = new Logger(AppVersionController.name);

  @Get("version")
  @Header("Cache-Control", "public, max-age=300")
  version(@Query("platform") platform?: string): AppVersionResponse {
    if (platform !== "ios" && platform !== "android") throw new BadRequestException("platform은 ios 또는 android여야 해요");
    const P = platform.toUpperCase();
    const env = (k: string) => process.env[`APP_${P}_${k}`]?.trim() || undefined;

    const rawLatest = env("LATEST_VERSION");
    const latestVersion = normalizeVersion(rawLatest);
    const storeUrl = env("STORE_URL") ?? DEFAULT_STORE_URL[platform];
    if (!latestVersion || !storeUrl) {
      if (rawLatest && !latestVersion) this.logger.warn(`APP_${P}_LATEST_VERSION 형식 오류: "${rawLatest}"`);
      throw new NotFoundException(`${platform} 버전 정보가 아직 설정되지 않았어요`);
    }
    const rawMin = env("MIN_VERSION");
    const minVersion = normalizeVersion(rawMin);
    if (rawMin && !minVersion) this.logger.warn(`APP_${P}_MIN_VERSION 형식 오류: "${rawMin}" — null로 보냄`);

    return { platform, latestVersion, minVersion, storeUrl, notes: env("NOTES") ?? null };
  }
}
