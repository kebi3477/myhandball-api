import axios from "axios";

export const BASE = process.env.BASE ?? "";

export function absUrl(pathOrUrl?: string | null): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${BASE}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

export function textOrNull(x?: string | null): string | null {
  const t = (x ?? "").replace(/\s+/g, " ").trim();
  return t.length ? t : null;
}

/** "12" → 12, "" / "-" / "abc" → null */
export function intOrNull(x?: string | null): number | null {
  const t = (x ?? "").trim();
  if (!/^-?\d+$/.test(t)) return null;
  return Number(t);
}

/** "4/6" → [4, 6]. 형식이 다르면 [0, 0] */
export function splitMadeAttempt(x?: string | null): [number, number] {
  const m = (x ?? "").trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

/** "2025-11-15" + "15:20" → "2025-11-15T15:20:00+09:00" (원본 시각은 KST) */
export function kstIso(dateISO: string | null, time: string | null): string | null {
  if (!dateISO || !time) return null;
  const m = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const iso = `${dateISO}T${m[1].padStart(2, "0")}:${m[2]}:00+09:00`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** href 안의 match_seq 쿼리 값 */
export function matchSeqFromHref(href?: string | null): number | null {
  const m = (href ?? "").match(/[?&]match_seq=(\d+)/);
  return m ? Number(m[1]) : null;
}

export async function fetchHtml(url: string): Promise<string> {
  const { data } = await axios.get<string>(url, {
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
  return data;
}
