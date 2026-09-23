import type { CheerioAPI } from "cheerio";
import { absUrl, intOrNull, textOrNull } from "../common/scrape";
import type { CoachItem, TeamHistoryItem, TeamSeasonRecord } from "./types";

// 여러 팀에 똑같이 들어 있는 기본 주소. 페이지에서도 display:none으로 숨겨져 있다
const PLACEHOLDER_ADDRESS = "서울 송파구 올림픽로 19-2 서울종합운동장";

/** <br>·<p>를 줄바꿈으로 바꿔 텍스트를 얻는다. 줄 앞뒤 공백 제거, 빈 줄은 최대 1개 */
function multilineText($: CheerioAPI, html: string | null): string | null {
  if (!html) return null;
  // 원본 소스의 개행은 들여쓰기용이라 버리고, <br>·</p>만 줄바꿈으로 쓴다
  const withBreaks = html
    .replace(/[\r\n]+/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n");
  const text = $("<div>").html(withBreaks).text();
  const lines = text.split("\n").map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim());
  const out = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return out || null;
}

export interface IntroTab {
  intro: string | null;
  foundedYear: number | null;
  homeTown: string | null;
  address: string | null;
  snsUrl: string | null;
  history: TeamHistoryItem[];
}

/** page_type=1 "구단소개" */
export function parseIntro($: CheerioAPI): IntroTab {
  const intro = multilineText($, $(".team_intro .intro_text").first().html());

  // 전용 필드가 없어 본문에서 추출한다. 못 찾으면 null (앱은 카드를 숨김)
  // "2016년에는 창단 이후 첫 우승" 같은 문맥은 창단 연도가 아니므로 제외
  const founded =
    intro?.match(/((?:19|20)\d{2})\s*년[^.\n]{0,20}?창단(?!\s*(?:이후|이래))/) ??
    intro?.match(/((?:19|20)\d{2})\.\d{1,2}\s[^\n]{0,30}창단/);
  const town =
    intro?.match(/([가-힣]{2,}(?:특별시|광역시|시|군))[을를]\s*연고/) ??
    intro?.match(/연고지?(?:는|인|로)?\s*([가-힣]{2,}(?:특별시|광역시|시|군))/);

  const addrRaw = $(".team_location .address li")
    .filter((_, li) => $(li).text().includes("주소"))
    .first()
    .text()
    .replace(/^\s*주소\s*:\s*/, "");
  const address = textOrNull(addrRaw);

  const sns = $(".sns_wrap a")
    .map((_, a) => $(a).attr("href") ?? "")
    .get()
    .find((h: string) => /^https?:\/\//i.test(h.trim()));

  const history: TeamHistoryItem[] = [];
  $(".team_history li").each((_, li) => {
    const $li = $(li).clone();
    const year = textOrNull($li.find(".font_blue").first().text());
    $li.find(".font_blue").first().remove();
    const text = multilineText($, $li.html());
    if (year && text) history.push({ year, text });
  });

  return {
    intro,
    foundedYear: founded ? Number(founded[1]) : null,
    homeTown: town?.[1] ?? null,
    address: address && address.replace(/\s+/g, " ") !== PLACEHOLDER_ADDRESS ? address : null,
    snsUrl: sns?.trim() ?? null,
    history,
  };
}

/** page_type=2 "코칭 스태프 소개". 직책 앞에 PHP 주석이 섞여 있어 텍스트만 쓴다 */
export function parseCoaches($: CheerioAPI): CoachItem[] {
  const out: CoachItem[] = [];
  $(".introduce_staff li").each((_, li) => {
    const $li = $(li);
    const name = textOrNull($li.find(".name").text());
    if (!name) return;
    out.push({
      name,
      role: textOrNull($li.find(".title").text()) ?? "",
      photoUrl: absUrl($li.find(".thumb img").attr("src") ?? null),
    });
  });
  return out;
}

/**
 * page_type=4 "팀기록" 시즌별 표. 왼쪽 시즌 라벨 + 오른쪽 기록.
 * 열: 득점, 6M, 윙, 9M, 7M, 속공, 돌파, 도움, 실책, 스틸, 블록샷, 경고, 2Min, 실격, 보고서
 */
export function parseSeasonRecords($: CheerioAPI): TeamSeasonRecord[] {
  const $wrap = $(".table_wrap.record").first();
  const labels = $wrap
    .find(".fixed_table tbody tr")
    .map((_, tr) => ($(tr).text() ?? "").replace(/\s+/g, " ").trim())
    .get() as string[];
  const rows = $wrap
    .find(".scroll_table tbody tr")
    .map((_, tr) => [$(tr).find("td").map((__, td) => $(td).text().trim()).get()])
    .get() as string[][];

  const out: TeamSeasonRecord[] = [];
  for (let i = 0; i < Math.min(labels.length, rows.length); i++) {
    const c = rows[i];
    if (c.length < 13) continue;
    const n = (k: number) => intOrNull(c[k]) ?? 0;
    out.push({
      season: labels[i].match(/\d{4}(?:-\d{4})?/)?.[0] ?? labels[i],
      postseason: labels[i].includes("챔피언") || labels[i].includes("포스트"),
      goals: n(0),
      goals6m: n(1),
      goalsWing: n(2),
      goals9m: n(3),
      goals7m: n(4),
      goalsFast: n(5),
      goalsBreakthrough: n(6),
      assists: n(7),
      turnovers: n(8),
      steals: n(9),
      blocks: n(10),
      yellowCards: n(11),
      twoMinutes: n(12),
      redCards: intOrNull(c[13]) ?? 0,
    });
  }
  return out;
}
