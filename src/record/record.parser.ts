import * as cheerio from "cheerio";
import { absUrl, intOrNull, textOrNull } from "../common/scrape";
import type { TeamRecordItem, TeamRecordStatKey } from "./types";

/**
 * 기록실 > 팀기록 (`/record/?league_season=&league_type=&league_gender=`) 파서.
 *
 * 실측 구조 (2025-26):
 * - `.table_wrap.record` 안에 좌 `#title_sort_table`(순위·팀명)과 우 `#target_sort_table`(기록) 두 표
 * - 우 표 헤더는 원래 2단(슛·공격·수비·처벌 / 세부)인데 윗단은 주석 처리돼 있어 실제로는 1단이다.
 *   열은 헤더 이름으로 찾는다 (연맹이 열을 추가하면 위치가 밀린다)
 * - 우 표 `<tr>`에 `TEAM_NM`, `team_rank`, `TEAM_IMG`(img 태그 문자열) 속성이 있다. 행마다 팀이 붙어 있어
 *   좌 표와 인덱스 병합할 필요가 없다. 속성이 없을 때만 좌 표의 같은 인덱스 행으로 채운다
 * - 각 행 끝의 주석 처리된 `<td>`는 cheerio가 요소로 보지 않는다
 * - 시즌 시작 전이면 헤더만 있고 tbody가 비어 있다 → 빈 배열
 */

/** 원본 헤더 이름 → 응답 필드. 헤더는 공백을 뺀 이름으로 비교한다 */
export const HEADER_TO_KEY: Record<string, TeamRecordStatKey> = {
  득점: "goals",
  필드득점: "fieldGoals",
  "6M": "goals6m",
  윙: "goalsWing",
  "9M": "goals9m",
  "7M": "goals7m",
  E7: "drawn7m",
  속공: "goalsFast",
  돌파: "goalsBreakthrough",
  도움: "assists",
  PC: "passClearChances",
  실책: "turnovers",
  스틸: "steals",
  블록샷: "blocks",
  PF: "personalFouls",
  세이브: "saves",
  필드세이브: "fieldSaves",
  경고: "yellowCards",
  "2Min": "twoMinutes",
  실격: "redCards",
  보고서: "reports",
};

const headerKey = (s: string) => s.replace(/\s+/g, "").toUpperCase();
const HEADER_LOOKUP = new Map(Object.entries(HEADER_TO_KEY).map(([h, k]) => [headerKey(h), k]));

export type ParsedTeamRecords = {
  items: TeamRecordItem[]; // team.name은 원본 그대로 (정규화 전)
  warnings: string[]; // 서비스가 Logger.warn으로 남긴다
};

export function parseTeamRecords(html: string): ParsedTeamRecords {
  const $ = cheerio.load(html);
  const warnings: string[] = [];

  const $wrap = $(".table_wrap.record").first();
  const $stats = $wrap.find("#target_sort_table").first().length
    ? $wrap.find("#target_sort_table").first()
    : $wrap.find(".scroll_table table").first();
  if (!$stats.length) {
    warnings.push("팀 기록 표(#target_sort_table)를 찾지 못함");
    return { items: [], warnings };
  }

  // 헤더 이름 → 열 인덱스. th가 가장 많은 헤더 행(세부 항목 행)을 쓴다
  let $headerRow = $stats.find("thead tr").first();
  $stats.find("thead tr").each((_, tr) => {
    if ($(tr).find("th").length > $headerRow.find("th").length) $headerRow = $(tr);
  });
  const colOf = new Map<TeamRecordStatKey, number>();
  $headerRow.find("th").each((i, th) => {
    const key = HEADER_LOOKUP.get(headerKey($(th).text()));
    if (key && !colOf.has(key)) colOf.set(key, i);
  });
  const missing = Object.values(HEADER_TO_KEY).filter((k) => !colOf.has(k));
  if (missing.length) warnings.push(`팀 기록 헤더 누락 (0으로 채움): ${missing.join(", ")}`);

  // 좌 표 (행 속성이 없을 때의 대체 값)
  const leftRows = $wrap
    .find("#title_sort_table tbody tr, .fixed_table.record_team table tbody tr")
    .toArray()
    .map((tr) => {
      const $td = $(tr).find("td");
      const $img = $td.eq(1).find("img").first();
      return {
        rank: intOrNull($td.eq(0).text()),
        name: textOrNull($img.attr("alt")) ?? textOrNull($td.eq(1).text()),
        logo: $img.attr("src") ?? null,
      };
    });

  const items: TeamRecordItem[] = [];
  $stats.find("tbody tr").each((i, tr) => {
    const $tr = $(tr);
    const $td = $tr.find("td");
    if (!$td.length) return;
    const left = leftRows[i];

    const imgSrc = ($tr.attr("team_img") ?? "").match(/src\s*=\s*["']([^"']+)["']/i)?.[1] ?? null;
    const name = textOrNull($tr.attr("team_nm")) ?? left?.name ?? null;
    const rank = intOrNull($tr.attr("team_rank")) ?? left?.rank ?? null;
    if (!name) {
      warnings.push(`팀 이름 없는 행 건너뜀 (${i + 1}번째)`);
      return;
    }

    const item = {
      rank: rank ?? i + 1,
      team: { name, logoUrl: absUrl(imgSrc ?? left?.logo ?? null) },
    } as TeamRecordItem;
    for (const key of Object.values(HEADER_TO_KEY)) {
      const col = colOf.get(key);
      const v = col === undefined ? null : intOrNull($td.eq(col).text());
      if (col !== undefined && v === null) warnings.push(`${name} ${key} 값 이상: "${$td.eq(col).text().trim()}"`);
      item[key] = v ?? 0;
    }
    items.push(item);
  });

  return { items, warnings };
}
