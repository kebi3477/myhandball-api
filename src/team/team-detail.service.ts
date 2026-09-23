import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import * as cheerio from "cheerio";
import { CacheService } from "../cache/cache.service";
import { BASE, fetchHtml } from "../common/scrape";
import { parseRoster } from "../player/player.parser";
import { RankingService } from "../ranking/ranking.service";
import { ScheduleService } from "../schedule/schedule.service";
import { parseCoaches, parseIntro, parseSeasonRecords } from "./team-detail.parser";
import { TeamService } from "./team.service";
import type { Gender, TeamDetailResponse, TeamItem } from "./types";

const PROFILE_TTL_SEC = 60 * 60 * 24;
// 순위·일정 서비스는 자체 캐시가 없어 여기서 짧게 캐시한다
const STANDING_TTL_SEC = 60 * 10;

type Profile = Pick<
  TeamDetailResponse,
  | "url"
  | "intro"
  | "foundedYear"
  | "homeTown"
  | "homeStadium"
  | "address"
  | "snsUrl"
  | "history"
  | "coaches"
  | "squad"
  | "seasonRecords"
>;

type Standing = Pick<
  TeamDetailResponse,
  "rank" | "points" | "played" | "wins" | "draws" | "losses" | "goalsFor" | "goalsAgainst" | "results"
>;

const norm = (s: string) => s.replace(/\s+/g, "");

@Injectable()
export class TeamDetailService {
  private readonly logger = new Logger(TeamDetailService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly teamService: TeamService,
    private readonly rankingService: RankingService,
    private readonly scheduleService: ScheduleService,
  ) {}

  async fetchDetail(
    teamNum: number,
    gender: Gender | null,
    season: string,
    type: string,
  ): Promise<TeamDetailResponse> {
    const { team, gender: g } = await this.findTeam(teamNum, gender);
    const [profile, standing] = await Promise.all([
      this.profile(team, g),
      this.standing(team, g, season, type),
    ]);
    return {
      ...profile,
      teamNum,
      name: team.name,
      gender: g,
      logoUrl: team.logoUrl,
      ...standing,
    };
  }

  /** gender를 안 주면 남녀 목록에서 모두 찾는다. name·logoUrl은 목록 API 값을 쓴다 */
  private async findTeam(teamNum: number, gender: Gender | null): Promise<{ team: TeamItem; gender: Gender }> {
    for (const g of gender ? [gender] : (["M", "W"] as Gender[])) {
      const team = (await this.teamService.fetchTeams(g)).teams.find((t) => t.teamNum === teamNum);
      if (team) return { team, gender: g };
    }
    throw new NotFoundException(`팀을 찾을 수 없습니다: ${teamNum}`);
  }

  private async profile(team: TeamItem, gender: Gender): Promise<Profile> {
    const key = `team:detail:${gender}:${team.teamNum}`;
    const hit = await this.cache.getJSON<Profile>(key);
    if (hit) return hit;

    const page = gender === "M" ? "team_men.php" : "team_women.php";
    const tabUrl = (t: number) => `${BASE}/introduce/${page}?team_num=${team.teamNum}&page_type=${t}`;
    const url = tabUrl(1);

    // 탭 4개가 각각 별도 URL(page_type=1~4)
    const tabs = await Promise.allSettled([1, 2, 3, 4].map((t) => fetchHtml(tabUrl(t))));
    const load = (i: number) => {
      const r = tabs[i];
      if (r.status === "fulfilled") return cheerio.load(r.value);
      this.logger.warn(`팀 페이지 탭 ${i + 1} 요청 실패 (${team.name}): ${r.reason}`);
      return null;
    };
    const [$intro, $staff, $squad, $record] = [0, 1, 2, 3].map(load);

    const intro = $intro ? parseIntro($intro) : null;
    if ($intro && !intro?.intro) this.logger.warn(`구단 소개 본문 없음 (${team.name})`);
    const coaches = $staff ? parseCoaches($staff) : [];
    if ($staff && !coaches.length) this.logger.warn(`코칭스태프 0건 (${team.name})`);
    const squad = $squad
      ? parseRoster($squad).map(({ playerSeq, name, number, position, photoUrl }) => ({
          playerSeq,
          name,
          number,
          position,
          photoUrl,
        }))
      : [];
    if ($squad && !squad.length) this.logger.warn(`선수 0건 (${team.name})`);
    const seasonRecords = $record ? parseSeasonRecords($record) : [];
    if ($record && !seasonRecords.length) this.logger.warn(`시즌별 팀 기록 0건 (${team.name})`);

    const profile: Profile = {
      url,
      intro: intro?.intro ?? null,
      foundedYear: intro?.foundedYear ?? null,
      homeTown: intro?.homeTown ?? null,
      homeStadium: null,
      address: intro?.address ?? null,
      snsUrl: intro?.snsUrl ?? null,
      history: intro?.history ?? [],
      coaches,
      squad,
      seasonRecords,
    };
    // 탭이 하나라도 실패했으면 캐시하지 않고 다음 요청에서 다시 받는다
    if (tabs.every((t) => t.status === "fulfilled")) await this.cache.setJSON(key, profile, PROFILE_TTL_SEC);
    return profile;
  }

  private async standing(team: TeamItem, gender: Gender, season: string, type: string): Promise<Standing> {
    const key = `team:standing:${gender}:${season}:${type}:${team.teamNum}`;
    const hit = await this.cache.getJSON<Standing>(key);
    if (hit) return hit;

    const name = norm(team.name);
    const [ranking, schedule] = await Promise.allSettled([
      this.rankingService.fetchRanking(gender, season, type),
      this.scheduleService.fetchSchedule(gender, season, type, ""),
    ]);

    const out: Standing = {
      rank: null,
      points: null,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      results: [],
    };

    if (ranking.status === "fulfilled") {
      const r = ranking.value.items.find((i) => norm(i.team.name) === name);
      if (r) {
        Object.assign(out, {
          rank: r.rank,
          points: r.points,
          played: r.played,
          wins: r.wins,
          draws: r.draws,
          losses: r.losses,
          goalsFor: r.goalsFor,
          goalsAgainst: r.goalsAgainst,
        });
      } else {
        this.logger.warn(`순위표에 팀 없음 (${team.name}, ${gender} ${season} type=${type})`);
      }
    } else {
      this.logger.warn(`순위 조회 실패 (${team.name}): ${ranking.reason}`);
    }

    if (schedule.status === "fulfilled") {
      // days는 날짜순. 점수가 숫자인 경기(종료된 경기)만 센다
      for (const day of schedule.value.days) {
        for (const g of day.games) {
          const isHome = norm(g.home.name) === name;
          if (!isHome && norm(g.away.name) !== name) continue;
          const m = (g.scoreText ?? "").match(/(\d+)\s*:\s*(\d+)/);
          if (!m) continue;
          const [mine, theirs] = isHome ? [+m[1], +m[2]] : [+m[2], +m[1]];
          out.results.push(mine > theirs ? "W" : mine < theirs ? "L" : "D");
        }
      }
    } else {
      this.logger.warn(`일정 조회 실패 (${team.name}): ${schedule.reason}`);
    }

    if (ranking.status === "fulfilled" && schedule.status === "fulfilled") {
      await this.cache.setJSON(key, out, STANDING_TTL_SEC);
    }
    return out;
  }
}
