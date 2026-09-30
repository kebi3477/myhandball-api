import { Injectable, Logger } from "@nestjs/common";
import { CacheService } from "../cache/cache.service";
import { BASE, fetchHtml } from "../common/scrape";
import { TeamService } from "../team/team.service";
import type { Gender } from "../team/types";
import { parseTeamRecords } from "./record.parser";
import type { TeamRecordsResponse } from "./types";

const TEAM_RECORDS_TTL_SEC = 60 * 60;

@Injectable()
export class RecordService {
  private readonly logger = new Logger(RecordService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly teamService: TeamService,
  ) {}

  private buildUrl(gender: Gender, season: string, type: string) {
    const u = new URL(`${BASE}/record/`);
    u.searchParams.set("league_season", season);
    u.searchParams.set("league_type", type);
    u.searchParams.set("league_gender", gender);
    return u.toString();
  }

  /**
   * 원본 요청 실패는 /api/ranking처럼 그대로 던진다 (500). 빈 목록은 "시즌 시작 전"과 구분이 안 돼서다.
   * 빈 결과는 캐시하지 않는다 (개막 직후 바로 채워지도록)
   */
  async fetchTeamRecords(gender: Gender, season: string, type: string): Promise<TeamRecordsResponse> {
    const key = `record:team:${gender}:${season}:${type}`;
    const hit = await this.cache.getJSON<TeamRecordsResponse>(key);
    if (hit) return hit;

    const url = this.buildUrl(gender, season, type);
    const html = await fetchHtml(url);

    let items: TeamRecordsResponse["items"] = [];
    try {
      const parsed = parseTeamRecords(html);
      for (const w of parsed.warnings) this.logger.warn(`${w} (${url})`);
      items = parsed.items;
    } catch (e) {
      this.logger.warn(`팀 기록 파싱 실패 (${url}): ${e}`);
    }
    if (!items.length) this.logger.warn(`팀 기록 0건 (${url}) — 시즌 시작 전이거나 원본 구조 변경`);

    const canonical = await this.teamService.canonicalNames([gender]);
    for (const it of items) it.team.name = canonical(it.team.name);

    const res: TeamRecordsResponse = {
      url,
      leagueGender: gender,
      leagueSeason: season,
      leagueType: type,
      items,
    };
    if (items.length) await this.cache.setJSON(key, res, TEAM_RECORDS_TTL_SEC);
    return res;
  }
}
