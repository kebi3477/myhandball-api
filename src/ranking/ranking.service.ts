import { Injectable } from "@nestjs/common";
import axios from "axios";
import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio as CheerioType } from "cheerio";
import { RankItem, RankTeamInfo, RankingResponse } from "./types";

const BASE = process.env.BASE ?? "";

function absUrl(pathOrUrl?: string | null): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${BASE}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

function textOrNull(x?: string): string | null {
  const t = (x ?? "").trim();
  return t.length ? t : null;
}

function parseLast5($row: CheerioType<any>, $: CheerioAPI): ("W"|"L"|"D")[] {
  return $row
    .find("td:last-child .match_result")
    .map((_, el) => {
      const cls = ($(el).attr("class") ?? "");
      if (cls.includes("w")) return "W";
      if (cls.includes("l")) return "L";
      return "D";
    })
    .get();
}

function parseLeftTable($left: CheerioType<any>, $: CheerioAPI) {
  const rows = $left.find("table.team_rank > tbody > tr").toArray();
  return rows.map((tr) => {
    const $tr = $(tr);
    const rank = Number(($tr.find("td").eq(0).text() ?? "").trim());

    const $teamCell = $tr.find("td").eq(1);
    const logoRel = $teamCell.find("img").attr("src") ?? null;
    const logoUrl = absUrl(logoRel);

    const name =
      textOrNull($teamCell.find("img").attr("alt") ?? "") ??
      textOrNull($teamCell.text()) ??
      "";

    const team: RankTeamInfo = { name, logoUrl };
    return { rank, team };
  });
}

function parseRightTable($right: CheerioType<any>, $: CheerioAPI) {
  const rows = $right.find("table > tbody > tr").toArray();
  return rows.map((tr) => {
    const $tr = $(tr);
    const tds = $tr.find("td");
    const played = Number((tds.eq(0).text() ?? "").trim());
    const points = Number((tds.eq(1).text() ?? "").trim());
    const wins = Number((tds.eq(2).text() ?? "").trim());
    const draws = Number((tds.eq(3).text() ?? "").trim());
    const losses = Number((tds.eq(4).text() ?? "").trim());
    const goalsFor = Number((tds.eq(5).text() ?? "").trim());
    const goalsAgainst = Number((tds.eq(6).text() ?? "").trim());
    const goalDiff = Number((tds.eq(7).text() ?? "").trim().replace(/[^\-0-9]/g, ""));
    const last5 = parseLast5($tr, $);

    return { played, points, wins, draws, losses, goalsFor, goalsAgainst, goalDiff, last5 };
  });
}

@Injectable()
export class RankingService {
  private buildUrl(league_gender: string, league_season: string, league_type: string) {
    const u = new URL(`${BASE}/game/teamranking.php`);
    u.searchParams.set("league_gender", league_gender);
    u.searchParams.set("league_season", league_season);
    u.searchParams.set("league_type", league_type);
    return u.toString();
  }

  async fetchRanking(
    league_gender: "W" | "M" = "W",
    league_season = "2024",
    league_type = "1",
  ): Promise<RankingResponse> {
    const url = this.buildUrl(league_gender, league_season, league_type);

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

    const $ = cheerio.load(html);

    // 래퍼
    const $wrap = $(".table_wrap.record").first();
    const $left = $wrap.find(".fixed_table.record_team").first();
    const $right = $wrap.find(".scroll_table").first();

    // 왼/오 표 각각 파싱 후 인덱스로 병합
    const leftRows = parseLeftTable($left, $);
    const rightRows = parseRightTable($right, $);

    const len = Math.min(leftRows.length, rightRows.length);
    const items: RankItem[] = [];
    for (let i = 0; i < len; i++) {
      const L = leftRows[i];
      const R = rightRows[i];
      items.push({
        rank: L.rank,
        team: L.team,
        played: R.played,
        points: R.points,
        wins: R.wins,
        draws: R.draws,
        losses: R.losses,
        goalsFor: R.goalsFor,
        goalsAgainst: R.goalsAgainst,
        goalDiff: R.goalDiff,
        last5: R.last5,
      });
    }

    return {
      url,
      leagueGender: league_gender,
      leagueSeason: league_season,
      leagueType: league_type,
      items,
    };
  }
}
