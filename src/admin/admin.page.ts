/**
 * 관리자 페이지 (GET /api/admin). 외부 리소스 없이 한 파일로 동작한다.
 * 토큰은 sessionStorage에만 두고, 데이터는 /api/admin/api/* 로 가져온다.
 * (TS 템플릿 문자열 안이라 스크립트에서 백틱을 쓰지 않는다)
 */
export const ADMIN_PAGE_HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>마이핸드볼 관리자</title>
<style>
  :root { color-scheme: light dark; --bg:#f6f7f9; --card:#fff; --fg:#1b1f24; --muted:#5b6470; --line:#e1e4e8; --accent:#0068ff; --danger:#d93025; --ok:#188038; }
  @media (prefers-color-scheme: dark) { :root { --bg:#111418; --card:#1a1e23; --fg:#e8eaed; --muted:#9aa3ad; --line:#2d333a; --accent:#4c8dff; --danger:#f28b82; --ok:#81c995; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.5 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif; }
  header { position:sticky; top:0; z-index:5; background:var(--card); border-bottom:1px solid var(--line); padding:10px 16px; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  header h1 { font-size:16px; margin:0 8px 0 0; }
  nav button { border:0; background:none; color:var(--muted); padding:6px 10px; border-radius:6px; cursor:pointer; font:inherit; }
  nav button.on { background:var(--bg); color:var(--fg); font-weight:600; }
  main { padding:16px; max-width:1200px; margin:0 auto; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px; margin-bottom:12px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); gap:8px; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:10px; cursor:pointer; }
  .stat b { display:block; font-size:20px; }
  .stat span { color:var(--muted); font-size:12px; word-break:break-all; }
  button.btn { border:1px solid var(--line); background:var(--card); color:var(--fg); border-radius:6px; padding:5px 10px; cursor:pointer; font:inherit; }
  button.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
  button.danger { color:var(--danger); border-color:var(--danger); }
  button:disabled { opacity:.5; cursor:default; }
  input, select, textarea { font:inherit; color:var(--fg); background:var(--bg); border:1px solid var(--line); border-radius:6px; padding:6px 8px; }
  .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:10px; }
  .muted { color:var(--muted); }
  .tag { display:inline-block; font-size:12px; padding:1px 6px; border-radius:10px; border:1px solid var(--line); margin-right:4px; }
  .tag.hidden { color:var(--danger); border-color:var(--danger); }
  .scroll { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; font-size:13px; }
  th, td { border-bottom:1px solid var(--line); padding:6px 8px; text-align:left; vertical-align:top; white-space:nowrap; max-width:280px; overflow:hidden; text-overflow:ellipsis; }
  th { position:sticky; top:0; background:var(--card); color:var(--muted); font-weight:600; }
  tbody tr { cursor:pointer; }
  tbody tr:hover { background:var(--bg); }
  .null { color:var(--muted); font-style:italic; }
  #editor { position:fixed; inset:0; background:rgba(0,0,0,.45); display:none; align-items:flex-start; justify-content:center; padding:24px 12px; overflow:auto; z-index:10; }
  #editor .card { width:min(640px,100%); }
  .field { margin-bottom:10px; }
  .field label { display:block; font-size:12px; color:var(--muted); margin-bottom:3px; }
  .field .line { display:flex; gap:6px; align-items:center; }
  .field input, .field select, .field textarea { width:100%; }
  #toast { position:fixed; bottom:16px; left:50%; transform:translateX(-50%); background:var(--fg); color:var(--bg); padding:8px 14px; border-radius:8px; display:none; z-index:20; max-width:90vw; }
  #login { max-width:380px; margin:12vh auto; }
</style>
</head>
<body>
<div id="login" class="card">
  <h2 style="margin-top:0">마이핸드볼 관리자</h2>
  <p class="muted">서버의 ADMIN_TOKEN을 입력하세요. 이 브라우저 탭에만 저장됩니다.</p>
  <div class="row"><input id="token" type="password" style="flex:1" placeholder="ADMIN_TOKEN" autocomplete="off"><button class="btn primary" id="loginBtn">들어가기</button></div>
  <div id="loginErr" style="color:var(--danger)"></div>
</div>
<div id="app" style="display:none">
  <header>
    <h1>마이핸드볼 관리자</h1>
    <nav><button data-tab="overview">개요</button><button data-tab="reports">신고된 응원글</button><button data-tab="tables">테이블</button></nav>
    <span style="flex:1"></span><button class="btn" id="logout">나가기</button>
  </header>
  <main>
    <section id="tab-overview"></section>
    <section id="tab-reports" style="display:none"></section>
    <section id="tab-tables" style="display:none"></section>
  </main>
</div>
<div id="editor"><div class="card" id="editorBody"></div></div>
<div id="toast"></div>
<script>
(function () {
  var API = location.pathname.replace(/\\/+$/, "") + "/api";
  var token = sessionStorage.getItem("mh_admin_token") || "";
  var state = { tables: [], table: null, page: 1, size: 50, q: "", data: null };

  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(msg, bad) { var t = $("toast"); t.textContent = msg; t.style.background = bad ? "var(--danger)" : ""; t.style.display = "block"; clearTimeout(t._h); t._h = setTimeout(function () { t.style.display = "none"; }, 2600); }
  function kb(n) { return n < 1024 ? n + "B" : (n / 1024).toFixed(1) + "KB"; }
  function when(iso) { if (!iso) return "-"; var d = new Date(iso); return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }); }

  function call(method, path, body) {
    var opt = { method: method, headers: { Authorization: "Bearer " + token } };
    if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
    return fetch(API + path, opt).then(function (r) {
      if (r.status === 401) { logout("토큰이 올바르지 않습니다"); throw new Error("401"); }
      var ct = r.headers.get("content-type") || "";
      var p = ct.indexOf("json") >= 0 ? r.json() : r.blob();
      return p.then(function (d) { if (!r.ok) throw new Error((d && d.message) || ("HTTP " + r.status)); return d; });
    });
  }
  function fail(e) { if (e.message !== "401") toast(Array.isArray(e.message) ? e.message.join(", ") : e.message, true); }

  function logout(msg) { sessionStorage.removeItem("mh_admin_token"); token = ""; $("app").style.display = "none"; $("login").style.display = ""; $("loginErr").textContent = msg || ""; }
  function login() {
    token = $("token").value.trim();
    call("GET", "/me").then(function () { sessionStorage.setItem("mh_admin_token", token); $("login").style.display = "none"; $("app").style.display = ""; show("overview"); })
      .catch(function (e) { if (e.message !== "401") $("loginErr").textContent = e.message; });
  }
  $("loginBtn").onclick = login;
  $("token").onkeydown = function (e) { if (e.key === "Enter") login(); };
  $("logout").onclick = function () { logout(""); };

  document.querySelectorAll("nav button").forEach(function (b) { b.onclick = function () { show(b.getAttribute("data-tab")); }; });
  function show(tab) {
    document.querySelectorAll("nav button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === tab); });
    ["overview", "reports", "tables"].forEach(function (t) { $("tab-" + t).style.display = t === tab ? "" : "none"; });
    if (tab === "overview") loadOverview();
    if (tab === "reports") loadReports();
    if (tab === "tables") loadTables();
  }

  // ---------- 개요 ----------
  function loadOverview() {
    var el = $("tab-overview");
    el.innerHTML = '<p class="muted">불러오는 중...</p>';
    Promise.all([call("GET", "/tables"), call("GET", "/backups")]).then(function (res) {
      state.tables = res[0];
      var b = res[1];
      var h = '<div class="card"><h3 style="margin-top:0">테이블</h3><div class="grid">';
      res[0].forEach(function (t) { h += '<div class="stat" data-t="' + esc(t.name) + '"><b>' + t.count.toLocaleString() + '</b><span>' + esc(t.name) + '</span></div>'; });
      h += '</div></div><div class="card"><div class="row"><h3 style="margin:0;flex:1">백업</h3><button class="btn primary" id="backupNow">지금 백업</button></div>';
      h += '<p class="muted" style="margin-top:0">매일 04:00(KST) 자동, 최근 14개 보관. 위치: ' + esc(b.dir) + '</p>';
      if (!b.files.length) h += '<p class="muted">아직 백업이 없습니다.</p>';
      else { h += '<div class="scroll"><table><thead><tr><th>파일</th><th>크기</th><th>시각</th><th></th></tr></thead><tbody>'; b.files.forEach(function (f) { h += '<tr><td>' + esc(f.file) + '</td><td>' + kb(f.size) + '</td><td>' + when(f.createdAt) + '</td><td><button class="btn" data-dl="' + esc(f.file) + '">다운로드</button></td></tr>'; }); h += '</tbody></table></div>'; }
      h += '</div>';
      el.innerHTML = h;
      el.querySelectorAll("[data-t]").forEach(function (s) { s.onclick = function () { state.table = s.getAttribute("data-t"); state.page = 1; state.q = ""; show("tables"); }; });
      el.querySelectorAll("[data-dl]").forEach(function (btn) { btn.onclick = function () { download(btn.getAttribute("data-dl")); }; });
      $("backupNow").onclick = function () { this.disabled = true; call("POST", "/backups").then(function (f) { toast("백업 완료: " + f.file); loadOverview(); }).catch(function (e) { fail(e); loadOverview(); }); };
    }).catch(fail);
  }
  function download(file) {
    call("GET", "/backups/" + encodeURIComponent(file)).then(function (blob) {
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file; document.body.appendChild(a); a.click(); a.remove();
    }).catch(fail);
  }

  // ---------- 신고된 응원글 ----------
  var REASON = { spam: "스팸", abuse: "욕설·비방", sexual: "음란", other: "기타" };
  function loadReports() {
    var el = $("tab-reports");
    el.innerHTML = '<p class="muted">불러오는 중...</p>';
    call("GET", "/reports").then(function (list) {
      if (!list.length) { el.innerHTML = '<div class="card muted">신고되거나 숨겨진 응원글이 없습니다.</div>'; return; }
      var h = '<p class="muted">신고 3건이면 자동으로 숨겨집니다. 복원하면 그 글의 신고 기록이 지워집니다.</p>';
      list.forEach(function (c) {
        var rs = Object.keys(c.reasons).map(function (k) { return '<span class="tag">' + esc(REASON[k] || k) + ' ' + c.reasons[k] + '</span>'; }).join("");
        h += '<div class="card"><div class="row" style="margin-bottom:6px">' + (c.hidden ? '<span class="tag hidden">숨김</span>' : '<span class="tag">공개</span>') +
          '<span class="muted">#' + c.id + ' · 팀 ' + c.teamNum + '(' + esc(c.gender) + ') · 작성자 ' + esc(c.authorId || "-") + ' · ' + when(c.createdAt) + ' · 좋아요 ' + c.likes + '</span></div>' +
          '<div style="white-space:pre-wrap;margin-bottom:8px">' + esc(c.text) + '</div>' +
          '<div class="row">신고 ' + c.reports + '건 ' + rs + '</div>' +
          (c.details.length ? '<div class="muted" style="margin-bottom:8px">' + c.details.map(esc).join("<br>") + '</div>' : '') +
          '<div class="row">' + (c.hidden ? '<button class="btn" data-act="unhide" data-id="' + c.id + '">복원</button>' : '<button class="btn" data-act="hide" data-id="' + c.id + '">숨김</button>') +
          '<button class="btn danger" data-act="delete" data-id="' + c.id + '">삭제</button></div></div>';
      });
      el.innerHTML = h;
      el.querySelectorAll("[data-act]").forEach(function (b) {
        b.onclick = function () {
          var id = b.getAttribute("data-id"), act = b.getAttribute("data-act");
          if (act === "delete" && !confirm("응원글 #" + id + "을 삭제할까요? 좋아요·신고 기록도 함께 지워집니다.")) return;
          var req = act === "delete" ? call("DELETE", "/cheers/" + id) : call("POST", "/cheers/" + id + "/" + act);
          req.then(function () { toast("처리했습니다"); loadReports(); }).catch(fail);
        };
      });
    }).catch(fail);
  }

  // ---------- 테이블 ----------
  function loadTables() {
    var ready = state.tables.length ? Promise.resolve(state.tables) : call("GET", "/tables").then(function (t) { state.tables = t; return t; });
    ready.then(function (tables) {
      if (!state.table) state.table = tables[0] && tables[0].name;
      var el = $("tab-tables");
      var opts = tables.map(function (t) { return '<option value="' + esc(t.name) + '"' + (t.name === state.table ? " selected" : "") + '>' + esc(t.name) + ' (' + t.count + ')</option>'; }).join("");
      el.innerHTML = '<div class="row"><select id="tSel">' + opts + '</select><input id="tQ" placeholder="검색 (문자열 부분 일치, 숫자는 정확히)" style="flex:1;min-width:180px" value="' + esc(state.q) + '"><button class="btn" id="tGo">검색</button></div><div id="tBody" class="card"><p class="muted">불러오는 중...</p></div>';
      $("tSel").onchange = function () { state.table = this.value; state.page = 1; state.q = ""; loadTables(); };
      $("tGo").onclick = function () { state.q = $("tQ").value.trim(); state.page = 1; loadRows(); };
      $("tQ").onkeydown = function (e) { if (e.key === "Enter") $("tGo").onclick(); };
      loadRows();
    }).catch(fail);
  }
  function meta() { return state.tables.filter(function (t) { return t.name === state.table; })[0]; }
  function cell(v) { if (v === null || v === undefined) return '<span class="null">null</span>'; if (typeof v === "object") v = JSON.stringify(v); return esc(v); }
  function loadRows() {
    var q = "?page=" + state.page + "&size=" + state.size + (state.q ? "&q=" + encodeURIComponent(state.q) : "");
    call("GET", "/tables/" + encodeURIComponent(state.table) + q).then(function (d) {
      state.data = d;
      var cols = meta().columns;
      var pages = Math.max(1, Math.ceil(d.total / d.size));
      var h = '<div class="row"><b style="flex:1">' + esc(d.table) + '</b><span class="muted">' + d.total.toLocaleString() + '행 · ' + d.page + '/' + pages + '쪽</span>' +
        '<button class="btn" id="pPrev"' + (d.page <= 1 ? " disabled" : "") + '>이전</button><button class="btn" id="pNext"' + (d.page >= pages ? " disabled" : "") + '>다음</button></div>';
      h += '<div class="scroll"><table><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c.name) + (c.primary ? " 🔑" : "") + '</th>'; }).join("") + '</tr></thead><tbody>';
      d.rows.forEach(function (r, i) { h += '<tr data-i="' + i + '">' + cols.map(function (c) { return '<td>' + cell(r[c.name]) + '</td>'; }).join("") + '</tr>'; });
      h += '</tbody></table></div>';
      if (!d.rows.length) h += '<p class="muted">행이 없습니다.</p>';
      $("tBody").innerHTML = h;
      $("pPrev").onclick = function () { state.page--; loadRows(); };
      $("pNext").onclick = function () { state.page++; loadRows(); };
      $("tBody").querySelectorAll("tr[data-i]").forEach(function (tr) { tr.onclick = function () { edit(d.rows[+tr.getAttribute("data-i")]); }; });
    }).catch(function (e) { $("tBody").innerHTML = '<p style="color:var(--danger)">' + esc(e.message) + '</p>'; });
  }

  function isNum(t) { return /int|numeric|float|double|decimal|number/.test(t); }
  function isBool(t) { return /bool/.test(t); }
  function edit(row) {
    var m = meta(), pk = state.data.primaryKey, id = row[pk];
    var h = '<div class="row"><h3 style="margin:0;flex:1">' + esc(m.name) + ' #' + esc(id) + '</h3><button class="btn" id="eClose">닫기</button></div>';
    m.columns.forEach(function (c) {
      var v = row[c.name], ro = c.primary || c.generated, isNull = v === null || v === undefined;
      var val = isNull ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v));
      var input;
      if (isBool(c.type)) input = '<select data-col="' + esc(c.name) + '"' + (ro ? " disabled" : "") + '><option value="true"' + (v === true ? " selected" : "") + '>true</option><option value="false"' + (v === false ? " selected" : "") + '>false</option></select>';
      else if (!isNum(c.type) && val.length > 60) input = '<textarea rows="3" data-col="' + esc(c.name) + '"' + (ro ? " disabled" : "") + '>' + esc(val) + '</textarea>';
      else input = '<input data-col="' + esc(c.name) + '" value="' + esc(val) + '"' + (ro ? " disabled" : "") + '>';
      var nullBox = c.nullable && !ro ? '<label style="white-space:nowrap"><input type="checkbox" data-null="' + esc(c.name) + '"' + (isNull ? " checked" : "") + '> null</label>' : "";
      h += '<div class="field"><label>' + esc(c.name) + ' <span class="muted">(' + esc(c.type) + (ro ? ", 수정 불가" : "") + ')</span></label><div class="line">' + input + nullBox + '</div></div>';
    });
    h += '<div class="row"><button class="btn primary" id="eSave">저장</button><span style="flex:1"></span><button class="btn danger" id="eDel">이 행 삭제</button></div>';
    if (m.name === "cheers") h += '<p class="muted">응원글은 "신고된 응원글" 탭에서 지우면 좋아요·신고 기록까지 함께 지워집니다.</p>';
    $("editorBody").innerHTML = h;
    $("editor").style.display = "flex";
    $("eClose").onclick = closeEditor;
    $("eSave").onclick = function () {
      var values = {};
      m.columns.forEach(function (c) {
        if (c.primary || c.generated) return;
        var inp = document.querySelector('[data-col="' + c.name + '"]');
        var nb = document.querySelector('[data-null="' + c.name + '"]');
        var orig = row[c.name];
        var v;
        if (nb && nb.checked) v = null;
        else if (isBool(c.type)) v = inp.value === "true";
        else if (isNum(c.type)) { if (inp.value.trim() === "") v = null; else v = Number(inp.value); }
        else v = inp.value;
        var o = orig === undefined ? null : orig;
        if (typeof o === "object" && o !== null) o = JSON.stringify(o);
        if (v !== o) values[c.name] = v;
      });
      if (!Object.keys(values).length) { toast("바뀐 값이 없습니다"); return; }
      call("PATCH", "/tables/" + encodeURIComponent(m.name) + "/" + encodeURIComponent(id), { values: values })
        .then(function () { toast("저장했습니다"); closeEditor(); loadRows(); }).catch(fail);
    };
    $("eDel").onclick = function () {
      if (!confirm(m.name + " #" + id + " 행을 삭제할까요? 되돌릴 수 없습니다.")) return;
      call("DELETE", "/tables/" + encodeURIComponent(m.name) + "/" + encodeURIComponent(id))
        .then(function () { toast("삭제했습니다"); closeEditor(); state.tables = []; loadTables(); }).catch(fail);
    };
  }
  function closeEditor() { $("editor").style.display = "none"; }
  $("editor").onclick = function (e) { if (e.target === this) closeEditor(); };

  if (token) { call("GET", "/me").then(function () { $("login").style.display = "none"; $("app").style.display = ""; show("overview"); }).catch(function () {}); }
})();
</script>
</body>
</html>`;
