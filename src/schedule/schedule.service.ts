import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import axios from "axios";
import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio as CheerioType } from "cheerio";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import { DayBlock, GameItem, ScheduleResponse, TeamInfo, LiveLink } from "./types";
import { intOrNull, kstIso, matchSeqFromHref } from "../common/scrape";
import { CacheService } from "../cache/cache.service";
import { MatchState } from "../live/match-state.entity";
import { computeStatus } from "../live/match-status";

dayjs.locale("ko");

const BASE = process.env.BASE ?? '';

function absUrl(pathOrUrl?: string | null): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${BASE}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

function textOrNull(x?: string): string | null {
  const t = (x ?? "").trim();
  return t.length ? t : null;
}

function parseDateISO(dateLabel: string): string | null {
  const m = dateLabel.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const d = dayjs(iso, "YYYY-MM-DD", true);
  return d.isValid() ? d.format("YYYY-MM-DD") : null;
}

function parseTeam($team: CheerioType<any>): TeamInfo {
  const name = ($team.find("p.name").first().text() ?? "").trim();
  const logoRel = $team.find("img").attr("src") ?? null;
  const logoUrl = absUrl(logoRel);
  return { name, logoUrl };
}

function normalizeLiveProvider(className: string, label: string): string {
  const lower = `${className} ${label}`.toLowerCase();
  if (lower.includes("naver")) return "naver";
  if (lower.includes("daum")) return "daum";
  if (lower.includes("kbs")) return "kbs";
  if (lower.includes("mbc")) return "mbc";
  if (lower.includes("sbs")) return "sbs";
  return "etc";
}

function parseLiveLinks($li: CheerioType<any>): LiveLink[] {
  const links: LiveLink[] = [];
  $li.find(".btn_wrap a.btn.live").each((_, el) => {
    const $a = $li.find(el);
    const href = ($a.attr("href") ?? "").trim();
    if (!/^https?:\/\//i.test(href)) {
      // TODO: Handle relative internal links (e.g. timeline.php) separately.
      return;
    }
    const className = ($a.attr("class") ?? "").trim();
    const label = ($a.text() ?? "").trim();
    links.push({
      provider: normalizeLiveProvider(className, label),
      url: href,
    });
  });
  return links;
}

function parseGame(
  $: CheerioAPI,
  $li: CheerioType<any>,
  containerId: string | null,
  dateISO: string | null,
): GameItem {
  const $score = $li.find(".game_score").first();

  const home = parseTeam($score.find(".team.home").first());
  const away = parseTeam($score.find(".team.away").first());
  const scoreText = textOrNull($score.find(".score").first().text());

  const $spans = $li.find(".game_info span");
  const parts = $spans.map((_, el) => ($(el).text() ?? "").trim()).get();

  let time: string | null = null;
  let broadcast: string[] = [];
  let venue: string | null = null;
  const liveLinks = parseLiveLinks($li);

  if (parts.length >= 2) {
    time = textOrNull(parts[0]);
    venue = textOrNull(parts[parts.length - 1]);
    if (parts.length > 2) {
      const braw = parts.slice(1, parts.length - 1).join(",");
      // "MAXPORTS, NAVER, 다음" -> ["MAXPORTS","NAVER","다음"]
      broadcast = braw.split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
    }
  } else if (parts.length === 1) {
    venue = textOrNull(parts[0]);
  }

  const matchSeq = matchSeqFromHref($li.find('a[href*="match_seq="]').first().attr("href"));
  const startsAt = kstIso(dateISO, time);

  // "20 : 23" → 20, 23. 경기 전 "- : -"는 null
  const [scoreHome, scoreAway] = $score
    .find(".score span")
    .map((_, el) => intOrNull($(el).text()))
    .get() as (number | null)[];

  return {
    home, away, scoreText, time, broadcast, liveLinks, venue, containerId, matchSeq, startsAt,
    status: null,
    scoreHome: scoreHome ?? null,
    scoreAway: scoreAway ?? null,
  };
}

const TODAY_TTL_SEC = 60;
const DEFAULT_TTL_SEC = 60 * 10;

function kstToday(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

@Injectable()
export class ScheduleService {
  constructor(
    private readonly cache: CacheService,
    @InjectRepository(MatchState) private readonly states: Repository<MatchState>,
  ) {}

  private buildUrl(league_gender: string, league_season: string, league_type: string, league_month: string) {
    const u = new URL(`${BASE}/game/schedule_list.php`);
    if (league_gender) {
      u.searchParams.set("league_gender", league_gender);
    }
    if (league_season) {
      u.searchParams.set("league_season", league_season);
    }
    if (league_type) {
      u.searchParams.set("league_type", league_type);
    }
    if (league_month) {
      u.searchParams.set("league_season_month", league_month);
    }
    return u.toString();
  }

  /** 원본 캐시(오늘 경기가 있으면 60초, 아니면 10분) 위에 경기 상태를 매 요청 새로 붙인다 */
  async fetchSchedule(
    league_gender: "W" | "M" | "" = "W",
    league_season = "2025",
    league_type = "1",
    league_month = "",
  ): Promise<ScheduleResponse> {
    const key = `schedule:${league_gender}:${league_season}:${league_type}:${league_month}`;
    let res = await this.cache.getJSON<ScheduleResponse>(key);
    if (!res) {
      res = await this.crawlSchedule(league_gender, league_season, league_type, league_month);
      const hasToday = res.days.some((d) => d.dateISO === kstToday());
      await this.cache.setJSON(key, res, hasToday ? TODAY_TTL_SEC : DEFAULT_TTL_SEC);
    }
    await this.applyStatus(res);
    return res;
  }

  private async applyStatus(res: ScheduleResponse) {
    const games = res.days.flatMap((d) => d.games);
    const seqs = games.map((g) => g.matchSeq).filter((s): s is number => s !== null);
    const states = seqs.length ? await this.states.find({ where: { matchSeq: In(seqs) } }) : [];
    const bySeq = new Map(states.map((s) => [s.matchSeq, s]));
    for (const g of games) {
      const state = g.matchSeq !== null ? bySeq.get(g.matchSeq) : undefined;
      g.status = computeStatus({ startsAt: g.startsAt, hasFinalScore: g.scoreHome !== null, state });
      if (state && g.status === "live" && state.scoreHome !== null) {
        g.scoreHome = state.scoreHome;
        g.scoreAway = state.scoreAway;
      }
    }
  }

  private async crawlSchedule(
    league_gender: "W" | "M" | "",
    league_season: string,
    league_type: string,
    league_month: string,
  ): Promise<ScheduleResponse> {
    const url = this.buildUrl(league_gender, league_season, league_type, league_month);

    const { data: html } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
        "Accept-Language": "ko,en;q=0.9",
      },
      timeout: 15000,
      responseType: "text",
      maxRedirects: 3,
      validateStatus: s => s >= 200 && s < 400,
    });

    const $ = cheerio.load(html);
    const $blocks = $(".record_list .cont");

    const days: DayBlock[] = [];

    $blocks.each((_, block) => {
      const $block = $(block);
      const dateLabel = ($block.find("p.date").first().text() ?? "").trim();
      const dateISO = parseDateISO(dateLabel);

      const containerId = $block.find("ul.list").attr("id") ?? null;

      const games: GameItem[] = [];
      $block.find("ul.list > li").each((__, li) => {
        games.push(parseGame($, $(li), containerId, dateISO));
      });

      if (games.length) {
        days.push({ dateLabel, dateISO, games });
      }
    });

    return {
      url,
      leagueGender: league_gender,
      leagueSeason: league_season,
      leagueType: league_type,
      leagueMonth: league_month,
      days,
    };
  }

  async buildMyTeamSeasonIcs(
    league_gender: "W" | "M",
    league_season: string,
    league_type: string,
    teamName: string,
  ): Promise<string> {
    const allDays: DayBlock[] = [];

    for (let m = 1; m <= 12; m++) {
      const monthStr = m.toString().padStart(2, "0");
      const monthSchedule = await this.fetchSchedule(
        league_gender,
        league_season,
        league_type,
        monthStr,
      );
      allDays.push(...monthSchedule.days);
    }

    const lines: string[] = [];
    lines.push("BEGIN:VCALENDAR");
    lines.push("PRODID:-//myteam-calendar//KO//");
    lines.push("VERSION:2.0");
    lines.push("CALSCALE:GREGORIAN");
    lines.push("METHOD:PUBLISH");

    const nowStamp = dayjs().format("YYYYMMDD[T]HHmmss[Z]");

    for (const day of allDays) {
      if (!day.dateISO) continue;

      for (const game of day.games) {
        const isMyTeam =
          game.home.name === teamName || game.away.name === teamName;
        if (!isMyTeam) continue;

        const timeLabel = game.time ?? "12:00";

        const [hhRaw, mmRaw] = timeLabel.split(":");
        const hh = (hhRaw ?? "12").padStart(2, "0");
        const mm = (mmRaw ?? "00").padStart(2, "0");

        const start = dayjs(`${day.dateISO} ${hh}:${mm}`);
        const end = start.add(2, "hour"); 

        const dtStart = start.format("YYYYMMDD[T]HHmmss");
        const dtEnd = end.format("YYYYMMDD[T]HHmmss");

        const vsText = `${game.home.name} vs ${game.away.name}`;
        const summary = vsText;

        const location = game.venue ?? "";

        const uidBase = `${league_season}-${day.dateISO}-${game.home.name}-${game.away.name}`;
        const uid = `${uidBase.replace(/\s+/g, "_")}@myteam-calendar`;

        lines.push("BEGIN:VEVENT");
        lines.push(`UID:${uid}`);
        lines.push(`DTSTAMP:${nowStamp}`);
        lines.push(`DTSTART:${dtStart}`);
        lines.push(`DTEND:${dtEnd}`);
        lines.push(`SUMMARY:${summary}`);
        if (location) {
          lines.push(`LOCATION:${location}`);
        }
        lines.push("END:VEVENT");
      }
    }

    lines.push("END:VCALENDAR");

    return lines.join("\r\n");
  }
}
