import { Controller, Get, Header } from "@nestjs/common";
import { renderPolicyHtml } from "./policy.html";
import { PRIVACY_POLICY } from "./privacy-policy";
import type { PolicyDocument } from "./types";

@Controller("policy")
export class PolicyController {
  /** GET /policy/privacy — 앱이 화면에 그릴 구조화된 처리방침 */
  @Get("privacy")
  privacy(): PolicyDocument {
    return PRIVACY_POLICY;
  }

  /**
   * GET /policy/privacy/page — 같은 내용의 웹페이지.
   * 앱스토어·플레이스토어의 "개인정보 처리방침 URL"에 이 주소를 넣는다
   */
  @Get("privacy/page")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "public, max-age=3600")
  privacyPage(): string {
    return renderPolicyHtml(PRIVACY_POLICY);
  }
}
