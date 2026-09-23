import { Controller, Get, Header } from "@nestjs/common";
import { renderPolicyHtml } from "./policy.html";
import { PRIVACY_POLICY } from "./privacy-policy";
import { TERMS_OF_SERVICE } from "./terms";
import type { PolicyDocument } from "./types";

/**
 * 정책 문서. 앱은 설정 화면에서 웹페이지(`/privacy`, `/terms`)를 외부 브라우저로 연다.
 * 그 짧은 주소는 Caddy가 아래 `/page` 경로로 이어 준다 (deploy/Caddyfile)
 */
@Controller("policy")
export class PolicyController {
  /** GET /policy/privacy — 개인정보 처리방침 (JSON) */
  @Get("privacy")
  privacy(): PolicyDocument {
    return PRIVACY_POLICY;
  }

  /** GET /policy/privacy/page — 개인정보 처리방침 웹페이지. 스토어 제출 URL로도 쓴다 */
  @Get("privacy/page")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "public, max-age=3600")
  privacyPage(): string {
    return renderPolicyHtml(PRIVACY_POLICY);
  }

  /** GET /policy/terms — 서비스 이용약관 (JSON) */
  @Get("terms")
  terms(): PolicyDocument {
    return TERMS_OF_SERVICE;
  }

  /** GET /policy/terms/page — 서비스 이용약관 웹페이지 */
  @Get("terms/page")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "public, max-age=3600")
  termsPage(): string {
    return renderPolicyHtml(TERMS_OF_SERVICE);
  }
}
