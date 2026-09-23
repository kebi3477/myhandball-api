import { Injectable } from "@nestjs/common";
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

function parseTeams($: CheerioAPI): TeamItem[] {
  const out: TeamItem[] = [];
  $("ul.team_picker li a").each((_, a) => {
    const $a = $(a as any);

    const hrefRel = ($a.attr("href") as string | undefined) ?? null;
    const href =
      hrefRel ? (hrefRel.startsWith("?") ? `${URLS.W}${hrefRel}` : absUrl(hrefRel)) : null;

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

@Injectable()
export class TeamService {
  constructor(private readonly cache: CacheService) {}

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
    const teams = parseTeams($);
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
