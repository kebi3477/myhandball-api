import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { currentSeason } from "../common/season";
import { LiveEvent } from "../live/live-event.entity";
import { ScheduleService } from "../schedule/schedule.service";
import { TeamService } from "../team/team.service";
import type { Gender } from "../team/types";
import type { WidgetResponse } from "./types";
import { WidgetGame, buildWidget } from "./widget.builder";

const norm = (s: string) => s.replace(/\s+/g, "");

/**
 * 위젯용 경량 응답. 자체 캐시는 없다.
 * 원본 일정은 ScheduleService 캐시(오늘 경기가 있으면 60초)를 타고, 경기 상태는 매번 match_states를 읽는다
 */
@Injectable()
export class WidgetService {
  constructor(
    private readonly scheduleService: ScheduleService,
    private readonly teamService: TeamService,
    @InjectRepository(LiveEvent) private readonly events: Repository<LiveEvent>,
  ) {}

  async myTeam(teamNum: number, gender: Gender): Promise<WidgetResponse> {
    const team = (await this.teamService.fetchTeams(gender)).teams.find((t) => t.teamNum === teamNum);
    if (!team) throw new NotFoundException(`팀을 찾을 수 없습니다: ${teamNum}`);
    const name = norm(team.name);
    const season = currentSeason();

    // 정규리그 + 포스트시즌
    const schedules = await Promise.all(
      ["1", "2"].map((type) => this.scheduleService.fetchSchedule(gender, season, type, "")),
    );
    const games: WidgetGame[] = schedules
      .flatMap((s) => s.days)
      .flatMap((d) =>
        d.games
          .filter((g) => norm(g.home.name) === name || norm(g.away.name) === name)
          .map((game) => ({ game, dateISO: d.dateISO ?? "", minute: null as number | null })),
      )
      .sort((a, b) => (a.game.startsAt ?? "").localeCompare(b.game.startsAt ?? ""));

    // 진행 중인 경기만 최신 경과 분을 붙인다 (인덱스: live_events.match_seq)
    for (const g of games) {
      if (g.game.status !== "live" || g.game.matchSeq === null) continue;
      const last = await this.events.findOne({
        where: { matchSeq: g.game.matchSeq },
        order: { half: "DESC", seq: "DESC" },
      });
      g.minute = last?.minute ?? null;
    }

    return buildWidget(games, Date.now());
  }
}
