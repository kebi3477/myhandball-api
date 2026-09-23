import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import * as cheerio from "cheerio";
import { CacheService } from "../cache/cache.service";
import { BASE, absUrl, fetchHtml, intOrNull, textOrNull } from "../common/scrape";
import { TeamService } from "../team/team.service";
import type { Gender, TeamItem } from "../team/types";
import {
  FIELD_SPAN,
  GK_SPAN,
  RosterEntry,
  fieldStats,
  gkStats,
  parseRoster,
  percentOrNull,
  sumStats,
  tableRows,
} from "./player.parser";
import {
  PlayerDetailResponse,
  PlayerItem,
  PlayerListResponse,
  PlayerRankingResponse,
  PlayerSeasonStats,
  StatCategory,
} from "./types";

const LIST_TTL_SEC = 60 * 60;
const DETAIL_TTL_SEC = 60 * 60 * 24;
const ROSTER_TTL_SEC = 60 * 60 * 24;

// 랭킹 페이지(playerranking.php)의 "○○ TOP5" 제목
const CATEGORY_TITLES: Record<StatCategory, string> = {
  goals: "득점",
  fieldGoals: "필드 득점",
  assists: "어시스트",
  saves: "세이브",
  fieldSaves: "필드 세이브",
  saveRate: "방어율",
  wingGoals: "윙 득점",
  breakthroughGoals: "돌파 득점",
  fastGoals: "속공 득점",
  goals7m: "7M 득점",
  saves7m: "7M 세이브",
  blocks: "블록슛",
  steals: "스틸",
  attackPoints: "공격포인트",
};

type TeamRef = Pick<PlayerItem, "teamName" | "teamNum" | "teamLogoUrl">;

const norm = (s: string) => s.replace(/\s+/g, "");

@Injectable()
export class PlayerService {
  private readonly logger = new Logger(PlayerService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly teamService: TeamService,
  ) {}

  /** 빈 결과(원본 요청 실패·파싱 실패)는 캐시하지 않아 다음 요청에서 다시 시도한다 */
  private async cached<T>(
    key: string,
    ttl: number,
    load: () => Promise<T>,
    isEmpty: (v: T) => boolean = () => false,
  ): Promise<T> {
    const hit = await this.cache.getJSON<T>(key);
    if (hit) return hit;
    const fresh = await load();
    if (!isEmpty(fresh)) await this.cache.setJSON(key, fresh, ttl);
    return fresh;
  }

  // ---------- 팀명 정규화 ----------

  private async teams(gender: Gender): Promise<TeamItem[]> {
    try {
      return (await this.teamService.fetchTeams(gender)).teams;
    } catch (e) {
      this.logger.warn(`팀 목록 조회 실패 (${gender}): ${e}`);
      return [];
    }
  }

  /** "인천" / "인천도시공사" / "상무피닉스" → 팀 목록의 전체 이름. 실패하면 원본 + teamNum null */
  private resolveTeam(raw: string, teams: TeamItem[]): TeamRef {
    const key = norm(raw);
    const hit =
      teams.find((t) => norm(t.name) === key) ??
      (() => {
        const c = key ? teams.filter((t) => norm(t.name).startsWith(key)) : [];
        return c.length === 1 ? c[0] : undefined;
      })();
    if (!hit) {
      if (raw) this.logger.warn(`팀명 매핑 실패: "${raw}"`);
      return { teamName: raw, teamNum: null, teamLogoUrl: null };
    }
    return { teamName: hit.name, teamNum: hit.teamNum, teamLogoUrl: hit.logoUrl };
  }

  // ---------- 로스터 (배번·포지션·사진) ----------

  private async roster(gender: Gender): Promise<Record<number, RosterEntry & { teamNum: number }>> {
    return this.cached(`player:roster:${gender}`, ROSTER_TTL_SEC, async () => {
      const page = gender === "M" ? "team_men.php" : "team_women.php";
      const teams = await this.teams(gender);
      const out: Record<number, RosterEntry & { teamNum: number }> = {};
      await Promise.all(
        teams.map(async (t) => {
          try {
            const html = await fetchHtml(`${BASE}/introduce/${page}?team_num=${t.teamNum}&page_type=3`);
            const list = parseRoster(cheerio.load(html));
            if (!list.length) this.logger.warn(`로스터 0건 (${t.name})`);
            for (const r of list) out[r.playerSeq] = { ...r, teamNum: t.teamNum };
          } catch (e) {
            this.logger.warn(`로스터 요청 실패 (${t.name}): ${e}`);
          }
        }),
      );
      return out;
    }, (r) => !Object.keys(r).length);
  }

  // ---------- 목록 ----------

  async fetchList(gender: Gender, season: string, type: string): Promise<PlayerListResponse> {
    return this.cached(`player:list:${gender}:${season}:${type}`, LIST_TTL_SEC, () =>
      this.crawlList(gender, season, type),
      (r) => !r.players.length,
    );
  }

  private recordUrl(gender: Gender, season: string, type: string, gk = false) {
    const u = new URL(`${BASE}/record/player.php`);
    u.searchParams.set("league_gender", gender);
    u.searchParams.set("league_season", season);
    u.searchParams.set("league_type", type);
    if (gk) u.searchParams.set("player_type", "GK");
    return u.toString();
  }

  private async crawlList(gender: Gender, season: string, type: string): Promise<PlayerListResponse> {
    const url = this.recordUrl(gender, season, type);
    const [fieldHtml, gkHtml, teams, roster] = await Promise.all([
      fetchHtml(url).catch((e) => (this.logger.warn(`선수 기록 요청 실패: ${e}`), "")),
      fetchHtml(this.recordUrl(gender, season, type, true)).catch(
        (e) => (this.logger.warn(`골키퍼 기록 요청 실패: ${e}`), ""),
      ),
      this.teams(gender),
      this.roster(gender),
    ]);

    const players: PlayerItem[] = [];
    const bySeq = new Map<number, PlayerItem>();

    const collect = (html: string, gk: boolean) => {
      if (!html) return;
      const $ = cheerio.load(html);
      const $table = $("#target_sort_table");
      // 열: NO, 팀, 이름(링크), 기록...
      $table.find("tbody tr").each((_, tr) => {
        const $td = $(tr).find("td");
        const c = $td.map((__, td) => ($(td).text() ?? "").replace(/\s+/g, " ").trim()).get();
        if (c.length < 3 + (gk ? GK_SPAN : FIELD_SPAN)) {
          this.logger.warn(`선수 기록 열 수 이상 (${c.length}열): ${c.slice(0, 3).join(" ")}`);
          return;
        }
        const seqMatch = ($td.eq(2).find("a").attr("href") ?? "").match(/player_seq=(\d+)/);
        const playerSeq = seqMatch ? Number(seqMatch[1]) : null;
        const stats = gk ? gkStats(c, 3, null) : fieldStats(c, 3, null);

        const existing = playerSeq !== null ? bySeq.get(playerSeq) : undefined;
        if (existing) {
          // 필드·골키퍼 양쪽에 있는 선수: 골키퍼 기록만 덧붙인다
          if (gk) Object.assign(existing.stats, { saves: stats.saves, shotsFaced: stats.shotsFaced, saveRate: stats.saveRate });
          return;
        }

        const r = playerSeq !== null ? roster[playerSeq] : undefined;
        const team = this.resolveTeam(c[1], teams);
        const item: PlayerItem = {
          playerSeq,
          name: c[2],
          number: r?.number ?? null,
          position: r?.position ?? (gk ? "GK" : null),
          ...team,
          teamNum: team.teamNum ?? r?.teamNum ?? null,
          photoUrl: r?.photoUrl ?? null,
          rank: intOrNull(c[0]),
          stats,
        };
        players.push(item);
        if (playerSeq !== null) bySeq.set(playerSeq, item);
      });
    };
    collect(fieldHtml, false);
    collect(gkHtml, true);

    if (!players.length) this.logger.warn(`선수 목록 0건 (${gender} ${season} type=${type})`);
    return { url, gender, season, type, players };
  }

  // ---------- 랭킹 ----------

  async fetchRanking(
    gender: Gender,
    season: string,
    type: string,
    category: StatCategory,
  ): Promise<PlayerRankingResponse> {
    return this.cached(`player:ranking:${gender}:${season}:${type}:${category}`, LIST_TTL_SEC, () =>
      this.crawlRanking(gender, season, type, category),
      (r) => !r.items.length,
    );
  }

  private async crawlRanking(
    gender: Gender,
    season: string,
    type: string,
    category: StatCategory,
  ): Promise<PlayerRankingResponse> {
    const u = new URL(`${BASE}/game/playerranking.php`);
    u.searchParams.set("league_gender", gender);
    u.searchParams.set("league_season", season);
    u.searchParams.set("league_type", type);
    const url = u.toString();

    const empty: PlayerRankingResponse = { url, gender, season, type, category, unit: "", items: [] };
    let html: string;
    try {
      html = await fetchHtml(url);
    } catch (e) {
      this.logger.warn(`랭킹 요청 실패: ${e}`);
      return empty;
    }
    const [list, teams] = await Promise.all([this.fetchList(gender, season, type), this.teams(gender)]);
    const statsBySeq = new Map(list.players.filter((p) => p.playerSeq !== null).map((p) => [p.playerSeq!, p]));

    const $ = cheerio.load(html);
    const title = `${CATEGORY_TITLES[category]} TOP5`;
    const $block = $(".ranking_wrap > ul > li")
      .filter((_, li) => norm($(li).find(".title_lg").text()) === norm(title))
      .first();
    if (!$block.length) {
      this.logger.warn(`랭킹 카테고리 없음: "${title}"`);
      return empty;
    }

    let unit = "";
    const items: PlayerRankingResponse["items"] = [];

    // 1위는 .rank_first, 2~5위는 .rank. 마크업이 달라 따로 읽는다
    const push = (
      rankText: string,
      $name: ReturnType<typeof $>,
      position: string | null,
      teamRaw: string | null,
      pointText: string,
      photo: string | null,
    ) => {
      const seqMatch = ($name.attr("href") ?? $name.find("a").attr("href") ?? "").match(/player_seq=(\d+)/);
      const playerSeq = seqMatch ? Number(seqMatch[1]) : null;
      const base = playerSeq !== null ? statsBySeq.get(playerSeq) : undefined;
      const pm = pointText.replace(/\s+/g, " ").match(/(\d+(?:\.\d+)?)\s*(\S+)\s*$/);
      if (pm && !unit) unit = pm[2];
      const pos = position?.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() ?? null;
      const no = position?.match(/No\.?\s*(\d+)/i);
      const team = base
        ? { teamName: base.teamName, teamNum: base.teamNum, teamLogoUrl: base.teamLogoUrl }
        : this.resolveTeam(teamRaw ?? "", teams);
      items.push({
        playerSeq,
        name: textOrNull($name.text()) ?? "",
        number: base?.number ?? (no ? Number(no[1]) : null),
        position: base?.position ?? pos,
        ...team,
        photoUrl: base?.photoUrl ?? photo,
        rank: intOrNull(rankText.replace(/[^\d]/g, "")),
        stats: base?.stats ?? this.statsFallback(),
        value: pm ? percentOrNull(pm[1]) : null,
      });
    };

    const $first = $block.find(".rank_first").first();
    if ($first.length) {
      push(
        $first.find(".rank_lg").text(),
        $first.find(".name").first(),
        textOrNull($first.find(".position").text()),
        textOrNull($first.find(".team_info p").text()),
        $first.find(".point").text(),
        absUrl($first.find(".thumb_img img").attr("src") ?? null),
      );
    }
    $block.find(".rank").each((_, el) => {
      const $r = $(el);
      push(
        $r.find(".ranking").text(),
        $r.find("a.name").first(),
        textOrNull($r.find(".position").text()),
        null,
        $r.find(".point").clone().children("em:not(.unit)").remove().end().text(),
        absUrl($r.find(".thumb_img img").attr("src") ?? null),
      );
    });

    if (!items.length) this.logger.warn(`랭킹 0건: ${category}`);
    return { url, gender, season, type, category, unit, items };
  }

  private statsFallback(): PlayerSeasonStats {
    return sumStats([]);
  }

  // ---------- 상세 ----------

  async fetchDetail(playerSeq: number): Promise<PlayerDetailResponse> {
    return this.cached(`player:detail:${playerSeq}`, DETAIL_TTL_SEC, () => this.crawlDetail(playerSeq));
  }

  private async crawlDetail(playerSeq: number): Promise<PlayerDetailResponse> {
    const url = `${BASE}/introduce/player_detail.php?player_seq=${playerSeq}`;
    const $ = cheerio.load(await fetchHtml(url));

    const $info = $(".player_information").first();
    const h4 = $info.find(".info h4").map((_, e) => textOrNull($(e).text()) ?? "").get() as string[];
    // h4[0] "No.32 [하남시청]", h4[1] "김지훈 JIHOON KIM / LW"
    const no = (h4[0] ?? "").match(/No\.?\s*(\d+)/i);
    const teamRaw = (h4[0] ?? "").match(/\[(.+?)\]/)?.[1] ?? "";
    // 존재하지 않는 player_seq는 200 + 빈 골격("No. []", " / ")을 준다 → 이름이 없으면 404
    const nameLine = (h4[1] ?? "").match(/^([^\s/]+)\s*(.*?)\s*(?:\/\s*([A-Za-z]+))?\s*$/);
    const name = nameLine?.[1] ?? "";
    if (!name) throw new NotFoundException(`선수를 찾을 수 없습니다: ${playerSeq}`);

    const dl: Record<string, string> = {};
    $info.find("dl dt").each((_, dt) => {
      dl[$(dt).text().trim()] = ($(dt).next("dd").text() ?? "").replace(/\s+/g, " ").trim();
    });
    const birthLabel = textOrNull(dl["출생"]);
    const bm = (birthLabel ?? "").match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    const birthDate = bm ? `${bm[1]}-${bm[2].padStart(2, "0")}-${bm[3].padStart(2, "0")}` : null;
    const hw = (dl["신장/체중"] ?? "").match(/(\d+)\s*cm\s*\/\s*(\d+)\s*kg/i);

    // 남녀 어느 쪽 팀인지 모르므로 양쪽 목록에서 찾는다
    const [mTeams, wTeams] = await Promise.all([this.teams("M"), this.teams("W")]);
    const team = this.resolveTeam(teamRaw, [...mTeams, ...wTeams]);

    const seasonStats = this.parseSeasonTable($, playerSeq);
    const regular = seasonStats.filter((s) => !s.postseason).map((s) => s.stats);
    const careerStats = this.applyCareerTable($, sumStats(regular));

    return {
      url,
      playerSeq,
      name,
      nameEn: textOrNull(nameLine?.[2]),
      number: no ? Number(no[1]) : null,
      position: nameLine?.[3]?.toUpperCase() ?? null,
      ...team,
      photoUrl: absUrl($info.find(".thumb img").attr("src") ?? null),
      birthDate,
      birthLabel,
      heightCm: hw ? Number(hw[1]) : null,
      weightKg: hw ? Number(hw[2]) : null,
      school: textOrNull(dl["출신학교"]),
      careerStats,
      seasonStats,
    };
  }

  /** "개인 시즌별 기록": 왼쪽 시즌 라벨 + 오른쪽 기록(첫 열 경기수). 골키퍼는 열 구성이 다르다 */
  private parseSeasonTable($: cheerio.CheerioAPI, playerSeq: number): PlayerDetailResponse["seasonStats"] {
    const $wrap = $(".table_wrap.record.player").first();
    const labels = $wrap
      .find(".fixed_table tbody tr")
      .map((_, tr) => ($(tr).find("td").text() ?? "").replace(/\s+/g, " ").trim())
      .get() as string[];
    const $scroll = $wrap.find(".scroll_table table").first();
    const isGk = norm($scroll.find("thead tr").eq(1).find("th").first().text()).startsWith("세이브");
    const rows = tableRows($, $scroll.find("tbody"));

    if (labels.length !== rows.length) {
      this.logger.warn(`시즌별 기록 행 수 불일치 ${labels.length}/${rows.length} (player_seq=${playerSeq})`);
    }
    const out: PlayerDetailResponse["seasonStats"] = [];
    for (let i = 0; i < Math.min(labels.length, rows.length); i++) {
      const c = rows[i];
      if (c.length < 1 + (isGk ? GK_SPAN : FIELD_SPAN)) continue;
      const season = labels[i].match(/\d{4}(?:-\d{4})?/)?.[0] ?? labels[i];
      const games = intOrNull(c[0]);
      out.push({
        season,
        postseason: labels[i].includes("포스트시즌"),
        stats: isGk ? gkStats(c, 1, games) : fieldStats(c, 1, games),
      });
    }
    if (!out.length) this.logger.warn(`시즌별 기록 0건 (player_seq=${playerSeq})`);
    return out;
  }

  /** "정규리그 통산기록" 표에 있는 값은 원본을 우선한다 (합산과 다를 경우 대비) */
  private applyCareerTable($: cheerio.CheerioAPI, stats: PlayerSeasonStats): PlayerSeasonStats {
    const $h3 = $("h3.sub_title").filter((_, h) => $(h).text().includes("정규리그 통산")).first();
    const $table = $h3.nextAll(".table_wrap").first().find("table").first();
    const heads = $table.find("thead th").map((_, th) => norm($(th).text())).get() as string[];
    const vals = $table.find("tbody tr").first().find("td").map((_, td) => $(td).text().trim()).get() as string[];
    if (!heads.length || heads.length !== vals.length) return stats;

    const v = (h: string) => {
      const i = heads.indexOf(h);
      return i >= 0 ? vals[i] : undefined;
    };
    const n = (h: string) => intOrNull(v(h));
    const out = { ...stats };
    out.games = n("경기수") ?? out.games;
    out.goals = n("득점") ?? out.goals;
    out.fieldGoals = n("필드득점") ?? out.fieldGoals;
    out.assists = n("어시스트") ?? out.assists;
    out.blocks = n("블록샷") ?? out.blocks;
    out.goalsWing = n("윙득점") ?? out.goalsWing;
    out.goals9m = n("9M득점") ?? out.goals9m;
    out.goals7m = n("7M득점") ?? out.goals7m;
    if (n("세이브") !== null) out.saves = n("세이브");
    if (percentOrNull(v("방어율")) !== null) out.saveRate = percentOrNull(v("방어율"));
    const pt = v("경기시간");
    if (pt && /^\d+:\d{2}$/.test(pt)) out.playTime = pt;
    return out;
  }
}
