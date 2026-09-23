import type { PolicyDocument, PolicySection } from "./types";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function section(s: PolicySection): string {
  const parts = [`<h2>${esc(s.title)}</h2>`];
  for (const p of s.paragraphs ?? []) parts.push(`<p>${esc(p)}</p>`);
  if (s.items?.length) parts.push(`<ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`);
  if (s.table) {
    const head = s.table.headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("");
    const rows = s.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
    parts.push(`<div class="table"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`);
  }
  return `<section id="${esc(s.id)}">${parts.join("")}</section>`;
}

/** 스토어 제출·웹 공개용 페이지. 외부 리소스 없이 한 파일로 끝난다 */
export function renderPolicyHtml(doc: PolicyDocument): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)} · 마이핸드볼</title>
<style>
  :root { color-scheme: light dark; --fg:#1b1f24; --muted:#5b6470; --line:#e3e6ea; --bg:#fff; --head:#f6f7f9; }
  @media (prefers-color-scheme: dark) { :root { --fg:#e8eaed; --muted:#a0a8b3; --line:#2e333a; --bg:#131619; --head:#1b1f24; } }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.7 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif; }
  main { max-width:760px; margin:0 auto; padding:32px 20px 64px; }
  h1 { font-size:24px; margin:0 0 4px; }
  .meta { color:var(--muted); font-size:13px; margin-bottom:24px; }
  h2 { font-size:17px; margin:32px 0 8px; }
  p, li { margin:6px 0; word-break:keep-all; }
  ul { padding-left:20px; }
  .table { overflow-x:auto; margin:10px 0; }
  table { border-collapse:collapse; width:100%; min-width:480px; font-size:14px; }
  th, td { border:1px solid var(--line); padding:8px 10px; text-align:left; vertical-align:top; word-break:keep-all; }
  th { background:var(--head); font-weight:600; }
</style>
</head>
<body>
<main>
<h1>${esc(doc.title)}</h1>
<div class="meta">시행일 ${esc(doc.effectiveDate)} · 버전 ${esc(doc.version)}</div>
<p>${esc(doc.intro)}</p>
${doc.sections.map(section).join("\n")}
</main>
</body>
</html>`;
}
