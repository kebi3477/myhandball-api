import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { load, CheerioAPI } from "cheerio";
import { TeamItem, TeamListResponse, Gender } from "./types";
import { CacheService } from "src/cache/cache.service";

const BASE = process.env.BASE ?? '';
const URLS = {
  W: `${BASE}/introduce/team_women.php`,
  M: `${BASE}/introduce/team_men.php`,
} as const;

function absUrl(pathOrUrl?: string | null): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${BASE}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

function textOrNull(x?: string): string | null {
  const t = (x ?? "").trim();
  return t.length ? t : null;
}

function parseTeams($: CheerioAPI, pageUrl: string): TeamItem[] {
  const out: TeamItem[] = [];
  $("ul.team_picker li a").each((_, a) => {
    const $a = $(a as any);

    const hrefRel = ($a.attr("href") as string | undefined) ?? null;
    const href =
      hrefRel ? (hrefRel.startsWith("?") ? `${pageUrl}${hrefRel}` : absUrl(hrefRel)) : null;

    let teamNum = NaN;
    if (hrefRel && hrefRel.includes("?")) {
      const qs = hrefRel.split("?")[1] ?? "";
      const params = new URLSearchParams(qs);
      const raw = params.get("team_num");
      if (raw) teamNum = Number(raw);
    }

    const name =
      textOrNull(($a.find("p.name").first().text() as string) ?? "") ??
      textOrNull(($a.find("img").attr("alt") as string | undefined) ?? "") ??
      "";

    const logoUrl = absUrl(($a.find("img").attr("src") as string | undefined) ?? null);

    if (!Number.isNaN(teamNum)) {
      out.push({ teamNum, name, logoUrl, href });
    }
  });

  return out;
}

/** 이름 매칭 키. 원본 페이지마다 공백이 다르다 ("상무 피닉스" / "상무피닉스") */
const nameKey = (name: string) => name.replace(/\s+/g, "");

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);
  private readonly warnedNames = new Set<string>();

  constructor(private readonly cache: CacheService) {}

  /**
   * 원본 페이지별로 다른 팀 이름을 팀 목록(introduce/team_*.php)의 이름으로 맞춘다.
   * 매칭 키는 공백을 뺀 이름. 못 찾으면 원본 이름을 그대로 돌려주고 warn (같은 이름은 한 번만)
   */
  async canonicalNames(genders: Gender[]): Promise<(name: string) => string> {
    const byKey = new Map<string, string>();
    for (const g of genders) {
      try {
        for (const t of (await this.fetchTeams(g)).teams) byKey.set(nameKey(t.name), t.name);
      } catch (e) {
        this.logger.warn(`팀 목록 조회 실패 (${g}) — 팀 이름을 원본 그대로 둔다: ${e}`);
      }
    }
    return (name: string) => {
      const hit = byKey.get(nameKey(name));
      if (hit !== undefined) return hit;
      if (name && byKey.size && !this.warnedNames.has(name)) {
        this.warnedNames.add(name);
        this.logger.warn(`팀 목록에 없는 팀 이름 — 원본 유지: "${name}"`);
      }
      return name;
    };
  }

  private key(gender: Gender) {
    return `teams:${gender}`;
  }

  private TTL_SECONDS = 60 * 60 * 24;

  private async crawl(gender: Gender): Promise<TeamListResponse> {
    const url = URLS[gender];

    const { data: html } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
        "Accept-Language": "ko,en;q=0.9",
      },
      timeout: 15000,
      responseType: "text",
      maxRedirects: 3,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    const $ = load(html);
    const teams = parseTeams($, url);
    return { url, gender, teams };
  }

  async fetchTeams(gender: Gender = "W"): Promise<TeamListResponse> {
    const key = this.key(gender);

    const cached = await this.cache.getJSON<TeamListResponse>(key);
    if (cached) return cached;

    const fresh = await this.crawl(gender);
    await this.cache.setJSON(key, fresh, this.TTL_SECONDS);

    return fresh;
  }
}
