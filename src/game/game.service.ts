import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from "@nestjs/common";
import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio as CheerioType } from "cheerio";
import { CacheService } from "../cache/cache.service";
import {
  BASE,
  absUrl,
  fetchHtml,
  intOrNull,
  kstIso,
  splitMadeAttempt,
  textOrNull,
} from "../common/scrape";
import { GameDetailResponse, GameTeam, PlayerGameRecord, TeamStatLine } from "./types";

// 양팀비교 표의 약어. 뜻은 원본 "용어설명" 팝업(div.popup_record) 기준
const ABBR_STATS: Record<string, { key: string; label: string }> = {
  AS: { key: "assists", label: "어시스트" },
  TF: { key: "turnovers", label: "실책" },
  ST: { key: "steals", label: "스틸" },
  BS: { key: "blocks", label: "블록슛" },
  YC: { key: "yellowCards", label: "경고" },
  "2MIN": { key: "twoMinutes", label: "2분 퇴장" },
  RC: { key: "redCards", label: "레드카드" },
  DR: { key: "blueCards", label: "블루카드" },
};

// 슛 성공률. 원본 도넛 차트는 성공률이 아니라 양 팀 시도 수 점유율이라 쓰지 않고,
// 선수 기록을 합산해 계산한다.
const SHOT_STATS: { key: string; label: string; pick: (p: PlayerGameRecord) => [number, number] }[] = [
  { key: "totalShots", label: "슛 성공률", pick: (p) => [p.goals, p.shots] },
  { key: "shots6m", label: "6m 성공률", pick: (p) => [p.goals6m, p.attempts6m] },
  { key: "shotsWing", label: "윙 성공률", pick: (p) => [p.goalsWing, p.attemptsWing] },
  { key: "shots9m", label: "9m 성공률", pick: (p) => [p.goals9m, p.attempts9m] },
  { key: "shots7m", label: "7m 성공률", pick: (p) => [p.goals7m, p.attempts7m] },
  { key: "shotsFast", label: "속공 성공률", pick: (p) => [p.goalsFast, p.attemptsFast] },
];

// 선수기록 표 열 순서 (detail_player_record.php 실측)
// 필드: 득점/슛, %, 필드 득점/슛, %, 6m, 윙, 9m, 7m, 속공, 돌파, EG, E7, 도움, PC, 실책, BD,
//       블록샷, 스틸, PF, 리바운드, 경고, 2min, 실격, 보고서, 출전시간
const FIELD_COLS = 25;
// 골키퍼: 세이브/슛, %, 필드 세이브/슛, %, 득점/슛, %, 필드 득점/슛, %, 도움,
//         윙, 6m, 9m, 7m, 속공, 돌파 (유형별 방어), High, Mid, Low, 출전시간
const GK_COLS = 19;

const FINISHED_AFTER_SEC = 3 * 60 * 60;
const FINISHED_TTL_SEC = 60 * 60 * 24;
const UPCOMING_TTL_SEC = 60 * 10;

/** "00:58:20" → "58:20". "0" / "00:00:00" → null */
function toPlayTime(raw: string): string | null {
  const m = raw.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const minutes = Number(m[1] ?? 0) * 60 + Number(m[2]);
  if (minutes === 0 && m[3] === "00") return null;
  return `${minutes}:${m[3]}`;
}

function rate(made: number, attempts: number): number {
  return attempts ? Math.round((made / attempts) * 1000) / 10 : 0;
}

function parseTeam($team: CheerioType<any>): GameTeam {
  return {
    name: textOrNull($team.find(".name").first().text()) ?? "",
    logoUrl: absUrl($team.find("img").attr("src") ?? null),
  };
}

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  constructor(private readonly cache: CacheService) {}

  private key(matchSeq: number) {
    return `game:${matchSeq}`;
  }

  /** 끝난 경기는 24시간, 시작 전은 짧게(시작 시각을 넘기지 않게), 진행 중일 수 있으면 캐시하지 않는다 */
  private ttlFor(startsAt: string | null): number | null {
    if (!startsAt) return null;
    const secToStart = Math.floor((Date.parse(startsAt) - Date.now()) / 1000);
    if (secToStart > 0) return Math.min(UPCOMING_TTL_SEC, secToStart);
    if (-secToStart >= FINISHED_AFTER_SEC) return FINISHED_TTL_SEC;
    return null;
  }

  async fetchGame(matchSeq: number): Promise<GameDetailResponse> {
    const key = this.key(matchSeq);
    const cached = await this.cache.getJSON<GameDetailResponse>(key);
    if (cached) return cached;

    const fresh = await this.crawl(matchSeq);
    const ttl = this.ttlFor(fresh.startsAt);
    if (ttl) await this.cache.setJSON(key, fresh, ttl);
    return fresh;
  }

  private async crawl(matchSeq: number): Promise<GameDetailResponse> {
    const url = `${BASE}/game/detail.php?match_seq=${matchSeq}`;
    const playerUrl = `${BASE}/game/detail_player_record.php?match_seq=${matchSeq}`;

    const [detail, player] = await Promise.allSettled([fetchHtml(url), fetchHtml(playerUrl)]);
    if (detail.status === "rejected") {
      this.logger.error(`detail.php 요청 실패 (match_seq=${matchSeq}): ${detail.reason}`);
      throw new HttpException("원본 사이트 응답 실패", HttpStatus.BAD_GATEWAY);
    }

    const $ = cheerio.load(detail.value);
    const $summary = $(".table_wrap.record.schedule_detial").first();

    const home = parseTeam($summary.find(".game_score .team.home").first());
    const away = parseTeam($summary.find(".game_score .team.away").first());

    // 존재하지 않는 match_seq도 200으로 빈 골격을 준다
    const headerText = textOrNull($summary.find("thead th").first().text()) ?? "";
    if (!home.name && !away.name && !/\d{4}\.\d{2}\.\d{2}/.test(headerText)) {
      throw new NotFoundException(`경기를 찾을 수 없습니다: ${matchSeq}`);
    }

    // "2025.11.15 (토) 15:20 [티켓링크 라이브 아레나(핸드볼경기장)]"
    const venueMatch = headerText.match(/\[(.*)\]\s*$/);
    const venue = textOrNull(venueMatch?.[1]);
    const dateLabel = headerText.replace(/\s*\[.*\]\s*$/, "").trim();
    const dm = dateLabel.match(/^(\d{4})\.(\d{2})\.(\d{2}).*?(\d{1,2}:\d{2})?$/);
    const startsAt = dm ? kstIso(`${dm[1]}-${dm[2]}-${dm[3]}`, dm[4] ?? null) : null;
    if (!startsAt) this.logger.warn(`경기 시각 파싱 실패 (match_seq=${matchSeq}): "${headerText}"`);

    // 점수는 win/lose/draw 클래스에 의존하지 않고 .vs가 아닌 span의 텍스트로 읽는다
    const scores = $summary
      .find(".game_score .score span")
      .not(".vs")
      .map((_, el) => intOrNull($(el).text()))
      .get() as (number | null)[];
    const scoreHome = scores[0] ?? null;
    const scoreAway = scores[1] ?? null;

    const halves = this.parseHalves($, $summary, matchSeq);
    const players = player.status === "fulfilled"
      ? this.parsePlayers(cheerio.load(player.value), home.name, away.name, matchSeq)
      : (this.logger.warn(`선수기록 요청 실패 (match_seq=${matchSeq}): ${player.reason}`),
        { home: [], away: [] });
    const stats = [...this.shotStats(players, matchSeq), ...this.abbrStats($, matchSeq)];

    return {
      url,
      matchSeq,
      dateLabel,
      startsAt,
      venue,
      home,
      away,
      scoreHome,
      scoreAway,
      ...halves,
      stats,
      players,
    };
  }

  private parseHalves($: CheerioAPI, $summary: CheerioType<any>, matchSeq: number) {
    const out = {
      firstHalfHome: null as number | null,
      firstHalfAway: null as number | null,
      secondHalfHome: null as number | null,
      secondHalfAway: null as number | null,
    };
    $summary.find("tbody tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length !== 3) return;
      const label = tds.eq(1).text().trim();
      const h = intOrNull(tds.eq(0).text());
      const a = intOrNull(tds.eq(2).text());
      if (label.startsWith("전반")) [out.firstHalfHome, out.firstHalfAway] = [h, a];
      else if (label.startsWith("후반")) [out.secondHalfHome, out.secondHalfAway] = [h, a];
    });
    if (out.firstHalfHome === null && out.secondHalfHome === null) {
      this.logger.warn(`전·후반 점수 없음 (match_seq=${matchSeq})`);
    }
    return out;
  }

  private abbrStats($: CheerioAPI, matchSeq: number): TeamStatLine[] {
    const stats: TeamStatLine[] = [];
    // 두 번째 schedule_detial 래퍼의 pc_only 표가 홈 | 약어 | 원정 3열
    $(".table_wrap.record.schedule_detial")
      .eq(1)
      .find(".pc_only table tbody tr")
      .each((_, tr) => {
        const tds = $(tr).find("td");
        if (tds.length !== 3) return;
        const abbr = tds.eq(1).text().trim();
        const home = intOrNull(tds.eq(0).text());
        const away = intOrNull(tds.eq(2).text());
        if (!abbr || home === null || away === null) return;
        const def = ABBR_STATS[abbr.toUpperCase()];
        if (!def) this.logger.warn(`알 수 없는 기록 약어 "${abbr}" (match_seq=${matchSeq})`);
        stats.push({
          key: def?.key ?? abbr.toLowerCase(),
          label: def?.label ?? abbr,
          home,
          away,
          unit: "count",
        });
      });
    if (!stats.length) this.logger.warn(`양팀비교 기록 0건 (match_seq=${matchSeq})`);
    return stats;
  }

  private shotStats(
    players: GameDetailResponse["players"],
    matchSeq: number,
  ): TeamStatLine[] {
    if (!players.home.length || !players.away.length) {
      this.logger.warn(`선수 기록이 없어 슛 성공률 생략 (match_seq=${matchSeq})`);
      return [];
    }
    const sum = (list: PlayerGameRecord[], pick: (p: PlayerGameRecord) => [number, number]) =>
      list.reduce(
        ([m, a], p) => {
          const [pm, pa] = pick(p);
          return [m + pm, a + pa] as [number, number];
        },
        [0, 0] as [number, number],
      );
    return SHOT_STATS.map(({ key, label, pick }) => ({
      key,
      label,
      home: rate(...sum(players.home, pick)),
      away: rate(...sum(players.away, pick)),
      unit: "percent" as const,
    }));
  }

  private parsePlayers(
    $: CheerioAPI,
    homeName: string,
    awayName: string,
    matchSeq: number,
  ): GameDetailResponse["players"] {
    const out: GameDetailResponse["players"] = { home: [], away: [] };

    // 팀별로 .record_table 하나씩 (홈 → 원정). 각 안에 필드 선수 표, 골키퍼 표 순
    $(".player_record_table .record_table").each((i, rt) => {
      const $rt = $(rt);
      const teamName = textOrNull($rt.find("h3.sub_title").first().text());
      const side =
        teamName && teamName === awayName ? "away"
        : teamName && teamName === homeName ? "home"
        : i === 0 ? "home" : "away";

      $rt.find(".table_wrap.record.sort").each((j, wrap) => {
        const isGk = $(wrap).prev("h3").hasClass("con_title") || j > 0;
        const ids = $(wrap)
          .find(".fixed_table tbody tr")
          .map((_, tr) => {
            const tds = $(tr).find("td");
            return { number: intOrNull(tds.eq(0).text()), name: textOrNull(tds.eq(1).text()) ?? "" };
          })
          .get() as { number: number | null; name: string }[];
        const rows = $(wrap)
          .find(".scroll_table tbody tr")
          .map((_, tr) => [$(tr).find("td").map((__, td) => $(td).text().trim()).get()])
          .get() as string[][];

        if (ids.length !== rows.length) {
          this.logger.warn(
            `선수기록 행 수 불일치 ${ids.length}/${rows.length} (match_seq=${matchSeq}, ${teamName})`,
          );
        }
        const n = Math.min(ids.length, rows.length);
        for (let k = 0; k < n; k++) {
          const rec = isGk ? this.gkRecord(ids[k], rows[k]) : this.fieldRecord(ids[k], rows[k]);
          if (rec) out[side].push(rec);
          else this.logger.warn(`선수기록 열 수 이상 (match_seq=${matchSeq}, ${ids[k].name})`);
        }
      });
    });

    if (!out.home.length && !out.away.length) {
      this.logger.warn(`선수기록 0건 (match_seq=${matchSeq})`);
    }
    return out;
  }

  private fieldRecord(id: { number: number | null; name: string }, c: string[]): PlayerGameRecord | null {
    if (c.length < FIELD_COLS) return null;
    const [goals, shots] = splitMadeAttempt(c[0]);
    const [fieldGoals, fieldShots] = splitMadeAttempt(c[2]);
    const [goals6m, attempts6m] = splitMadeAttempt(c[4]);
    const [goalsWing, attemptsWing] = splitMadeAttempt(c[5]);
    const [goals9m, attempts9m] = splitMadeAttempt(c[6]);
    const [goals7m, attempts7m] = splitMadeAttempt(c[7]);
    const [goalsFast, attemptsFast] = splitMadeAttempt(c[8]);
    const [goalsBreakthrough, attemptsBreakthrough] = splitMadeAttempt(c[9]);
    return {
      ...id,
      position: "field",
      goals,
      shots,
      fieldGoals,
      fieldShots,
      shots6m: c[4] || "0/0",
      goals6m,
      attempts6m,
      goalsWing,
      attemptsWing,
      goals9m,
      attempts9m,
      goals7m,
      attempts7m,
      goalsFast,
      attemptsFast,
      goalsBreakthrough,
      attemptsBreakthrough,
      assists: intOrNull(c[12]) ?? 0,
      turnovers: intOrNull(c[14]) ?? 0,
      blocks: intOrNull(c[16]) ?? 0,
      steals: intOrNull(c[17]) ?? 0,
      saves: null,
      shotsFaced: null,
      playTime: toPlayTime(c[c.length - 1]),
    };
  }

  /** 골키퍼 표에는 슛 위치별 기록이 없다(유형별 칸은 방어 기록). 득점·필드 득점만 채운다 */
  private gkRecord(id: { number: number | null; name: string }, c: string[]): PlayerGameRecord | null {
    if (c.length < GK_COLS) return null;
    const [saves, shotsFaced] = splitMadeAttempt(c[0]);
    const [goals, shots] = splitMadeAttempt(c[4]);
    const [fieldGoals, fieldShots] = splitMadeAttempt(c[6]);
    return {
      ...id,
      position: "goalkeeper",
      goals,
      shots,
      fieldGoals,
      fieldShots,
      shots6m: "0/0",
      goals6m: 0,
      attempts6m: 0,
      goalsWing: 0,
      attemptsWing: 0,
      goals9m: 0,
      attempts9m: 0,
      goals7m: 0,
      attempts7m: 0,
      goalsFast: 0,
      attemptsFast: 0,
      goalsBreakthrough: 0,
      attemptsBreakthrough: 0,
      assists: intOrNull(c[8]) ?? 0,
      turnovers: 0,
      blocks: 0,
      steals: 0,
      saves,
      shotsFaced,
      playTime: toPlayTime(c[c.length - 1]),
    };
  }
}
