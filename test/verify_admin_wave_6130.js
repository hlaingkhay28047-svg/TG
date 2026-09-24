"use strict";
/* verify_admin_wave_6130.js — 6.130.0 / panel 6.201.0
   THE ADMIN CONSOLE, WAVE A: A LOADING STATE, A WAY OUT, AND WHAT IS LIVE.

   The console had not been touched since 6.49.0 — eighty releases. Measuring it
   rather than reading it produced three absences, each counted at zero before a
   line was written:

     - LOADING. `grep -c "skeleton|aria-busy"` over admin.css, admin.js and
       index.html returned 0, 0, 0. A slow line left the previous page's rows on
       screen with nothing to say the console was working, and a screen reader
       was told nothing at all.
     - A WAY OUT. `grep -ic "csv|export"` returned 0. A teacher could read a
       list and never take it anywhere.
     - WHAT IS LIVE. The Security page managed the panel's version policy and
       nothing on any page said which web app or API version was actually
       serving, so a finished deploy and one still running looked identical.

   This test proves all three in a booted console over mocked admin endpoints,
   in the row shapes the real lists use, and pins the source that makes them so.

   A) the source   B) the console, booted (loading · CSV · release · reach)
   C) the release chain */
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright-core");

const ROOT = path.resolve(__dirname, "..");
const DOCS = path.join(ROOT, "docs");
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const HTML = read("docs/admin/index.html");
const CSS = read("docs/admin/admin.css");
const JSRC = read("docs/admin/admin.js");
const CI = read(".github/workflows/test.yml");
const VER = "6.133.0", PVER = "6.204.0", COUNT = 275;

let pass = 0, fail = 0;
function report(name, ok, detail) {
  if (ok) { pass++; console.log("PASS — " + name); }
  else { fail++; console.log("FAIL — " + name + (detail === undefined ? "" : "  :: " + JSON.stringify(detail).slice(0, 700))); }
}

/* ===================== A) the source ===================== */
report("A1) the two lists and the release card carry their new controls in the markup, so they exist before a single byte of script runs",
  has(HTML, 'id="exportStudents"') && has(HTML, 'data-i18n="st.export"') &&
  has(HTML, 'id="exportHistory"') && has(HTML, 'data-i18n="hi.export"') &&
  has(HTML, 'id="releaseCard"') && has(HTML, 'id="releaseRows"') && has(HTML, 'id="reloadRelease"') &&
  has(HTML, 'class="head-actions"'), null);

report("A2) the stylesheet has a skeleton row, and its only animation stops under prefers-reduced-motion",
  has(CSS, ".skel-cell") && has(CSS, ".skel-row") && has(CSS, ".skel-card") &&
  has(CSS, "@keyframes skelSweep") && has(CSS, '[aria-busy="true"]') &&
  /@media\(prefers-reduced-motion:reduce\)\{\.skel-cell\{animation:none\}\}/.test(CSS), null);

report("A3) the loading engine marks the same container a screen reader is told about, and clears it in a finally so a refusal cannot leave the list busy for ever",
  has(JSRC, "function setBusy(rowsSel, cardsSel, on, widths)") &&
  has(JSRC, 'host.setAttribute("aria-busy", on ? "true" : "false")') &&
  (JSRC.match(/finally \{ setBusy\(/g) || []).length === 3   /* students · history · usage (6.131.0) */, null);

report("A4) the CSV engine quotes what has to be quoted, writes the BOM Excel needs for Burmese names, walks the pages of the filter on screen, and has a hard ceiling",
  has(JSRC, "function csvCell(value)") && has(JSRC, 'text.replace(/"/g, \'""\')') &&
  has(JSRC, '"\\uFEFF" + [header, ...rows]') && has(JSRC, "const CSV_PAGE_CAP = 25") &&
  has(JSRC, "async function collectPages(path, query, keys)") &&
  has(JSRC, "if (batch.length < pageSize) break;"), null);

report("A5) the release card reads the deploy workflow's own readiness endpoint and the panel policy, and never leaves a stale verdict behind a failed read",
  has(JSRC, 'readJson("/api/health")') && has(JSRC, 'readJson("/app/version.json")') &&
  has(JSRC, "health.apiVersion") && has(JSRC, "api(API.panelVersion)") &&
  has(JSRC, 'host.setAttribute("aria-busy", "true")'), null);

report("A6) every line the wave adds is in the console's own second language",
  ["st.export", "hi.export", "ov.relHead", "ov.relRefresh", "rel.app", "rel.api", "rel.panel",
   "rel.min", "rel.console", "rel.ok", "rel.diff", "rel.unknown", "msg.csvNone", "msg.csvDone", "msg.csvBusy"]
    .every(key => new RegExp('"' + key.replace(".", "\\.") + '":\\s*"[^"]+"').test(JSRC)), null);

report("A7) the cache token is the file's own content, so a changed console can never ship behind a stale URL",
  (() => {
    const crypto = require("crypto");
    return ["admin.css", "admin.js"].every(file => {
      const token = crypto.createHash("sha256").update(fs.readFileSync(path.join(DOCS, "admin", file))).digest("hex").slice(0, 12);
      return has(HTML, `${file}?v=${token}`);
    });
  })(), null);

/* ===================== B) the console, booted ===================== */
function staticServer() {
  return http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    const file = path.resolve(DOCS, "." + pathname);
    if (!file.startsWith(DOCS + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end("no"); return; }
    const type = file.endsWith(".html") ? "text/html; charset=utf-8"
      : file.endsWith(".css") ? "text/css; charset=utf-8"
      : file.endsWith(".json") ? "application/json; charset=utf-8" : "application/javascript; charset=utf-8";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
}

/* two pages of students, so the export has to walk more than one */
const PAGE_SIZE = 20;
function studentPage(page) {
  const rows = [];
  const many = page === 1 ? PAGE_SIZE : 3;
  for (let i = 0; i < many; i += 1) {
    const n = (page - 1) * PAGE_SIZE + i + 1;
    rows.push({ id: "student-" + n, name: n === 1 ? 'Aye, "Ma" Aye' : "Student " + n,
      email: `s${n}@example.com`, account_status: "active", license_status: "active",
      expires_at: "2026-12-01T00:00:00Z", last_active_at: "2026-09-20T00:00:00Z", created_at: "2026-01-05T00:00:00Z" });
  }
  return { students: rows, page, total: PAGE_SIZE + 3 };
}

async function walk() {
  const server = staticServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", e => e ? reject(e) : resolve()));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const out = { errs: [] };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", e => out.errs.push(String(e).slice(0, 200)));
  let holdStudents = false;
  const pagesAsked = [];
  try {
    await page.addInitScript(() => { localStorage.setItem("hnk_admin_lang_v1", "en"); });
    await page.route("**/api/**", async route => {
      const request = route.request(), url = request.url();
      const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.includes("grant_type=password")) return json(200, { access_token: "A", refresh_token: "R", expires_at: 1999999999, session_id: "s", user: { id: "admin-1", email: "owner@example.com" } });
      if (url.includes("/api/health")) return json(200, { ok: true, apiVersion: VER });
      if (url.includes("/admin/session")) return json(200, { admin: { id: "admin-1", email: "owner@example.com", role: "admin" } });
      if (url.includes("/dashboard")) return json(200, { total: 23, active: 20, pending: 2, online: 1, latest_logins: [], signups: [] });
      if (url.includes("/visits")) return json(200, { days: [], pages: [] });
      if (url.includes("/panel-version")) return json(200, { latest_version: PVER, minimum_supported_version: "6.24.0" });
      if (/\/students(?:\?|$)/.test(url)) {
        const asked = Number(new URL(url).searchParams.get("page") || 1);
        pagesAsked.push(asked);
        if (holdStudents) await new Promise(r => setTimeout(r, 700));
        return json(200, studentPage(asked));
      }
      if (url.includes("/histories")) return json(200, { events: [{ created_at: "2026-09-21T02:00:00Z", name: "Aye Aye", email: "aye@example.com", event_type: "login", result: "success", device_name: "iPhone", detail: "web_app" }], page: 1, total: 1 });
      return json(200, { ok: true });
    });
    await page.goto(`${origin}/admin/index.html`, { waitUntil: "load" });
    await page.fill("#adminLoginEmail", "owner@example.com");
    await page.fill("#adminLoginPassword", "secret");
    await page.click("#adminLoginButton");
    await page.waitForSelector("#adminApp:not([hidden])", { timeout: 20000 });
    await page.waitForTimeout(700);

    /* the release card, drawn from the live reads */
    out.release = await page.evaluate(() => {
      const host = document.getElementById("releaseRows");
      return { busy: host.getAttribute("aria-busy"),
        rows: [...host.querySelectorAll(".rel-row")].map(r => ({
          value: r.querySelector("b").textContent, label: r.querySelector("small").textContent,
          verdict: (r.querySelector(".status-pill") || {}).textContent || "" })) };
    });

    /* loading: hold the students answer and read the list mid-flight */
    holdStudents = true;
    await page.evaluate(() => { document.querySelector('[data-panel="students"]').click(); });
    await page.waitForTimeout(200);
    out.busy = await page.evaluate(() => ({
      rows: document.getElementById("studentRows").getAttribute("aria-busy"),
      cards: document.getElementById("studentCards").getAttribute("aria-busy"),
      skelRows: document.querySelectorAll("#studentRows .skel-row").length,
      skelCards: document.querySelectorAll("#studentCards .skel-card").length,
      cells: document.querySelectorAll("#studentRows .skel-row:first-child .skel-cell").length,
    }));
    await page.waitForFunction(() => document.getElementById("studentRows").getAttribute("aria-busy") === "false", null, { timeout: 20000 });
    holdStudents = false;
    out.settled = await page.evaluate(() => ({
      busy: document.getElementById("studentRows").getAttribute("aria-busy"),
      skel: document.querySelectorAll("#studentRows .skel-row").length,
      rows: document.querySelectorAll("#studentRows tr").length,
    }));

    /* CSV: the students export, over two pages of the filter on screen */
    pagesAsked.length = 0;
    const [studentDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 20000 }),
      page.click("#exportStudents"),
    ]);
    out.studentCsvName = studentDownload.suggestedFilename();
    out.studentCsv = fs.readFileSync(await studentDownload.path(), "utf8");
    out.pagesAsked = [...pagesAsked];

    /* CSV: the activity export */
    await page.evaluate(() => { document.querySelector('[data-panel="history"]').click(); });
    await page.waitForTimeout(500);
    const [historyDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 20000 }),
      page.click("#exportHistory"),
    ]);
    out.historyCsvName = historyDownload.suggestedFilename();
    out.historyCsv = fs.readFileSync(await historyDownload.path(), "utf8");

    /* reach + overflow on the phone, on the panel the new buttons live on */
    await page.evaluate(() => { document.querySelector('[data-panel="students"]').click(); });
    await page.waitForTimeout(400);
    out.reach = await page.evaluate(() => {
      const small = [];
      ["#exportStudents", "#reloadStudents", "#exportHistory", "#reloadRelease"].forEach(sel => {
        const el = document.querySelector(sel);
        if (!el) { small.push(sel + ":missing"); return; }
        const r = el.getBoundingClientRect();
        if (r.height && (r.height < 44 || r.width < 44)) small.push(`${sel}:${Math.round(r.width)}x${Math.round(r.height)}`);
      });
      return { small, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });

    /* the same console in Burmese */
    await page.evaluate(() => { document.getElementById("langToggle").click(); });
    await page.waitForTimeout(300);
    out.burmese = await page.evaluate(() => ({
      exportWord: document.getElementById("exportStudents").textContent,
      relHead: document.querySelector("#releaseCard h3").textContent,
    }));
  } finally {
    await ctx.close(); await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  return out;
}

(async () => {
  const r = await walk();

  report("B1) while the students answer is still in flight the list says so — aria-busy on both the table body and the card list, six skeleton rows in the seven-column shape the real table uses",
    r.busy.rows === "true" && r.busy.cards === "true" && r.busy.skelRows === 6 && r.busy.skelCards === 6 && r.busy.cells === 7, r.busy);

  report("B2) when the answer lands the busy state is cleared, every skeleton is gone and the real rows are there",
    r.settled.busy === "false" && r.settled.skel === 0 && r.settled.rows === 20, r.settled);

  report("B3) the release card names five surfaces with the values actually read — the app's version.json, the API's own apiVersion, the panel policy, the oldest panel still allowed and this console's token — and calls a matching pair matched",
    r.release.busy === "false" && r.release.rows.length === 5 &&
    r.release.rows[0].value === VER && r.release.rows[0].verdict === "matched" &&
    r.release.rows[1].value === VER && r.release.rows[2].value === PVER &&
    r.release.rows[3].value === "6.24.0" && /^[0-9a-f]{12}$/.test(r.release.rows[4].value), r.release);

  report("B4) the students export writes a real CSV: the BOM Excel needs, the eight headings, one line per student, and a name holding a comma and a quote comes back quoted and escaped",
    r.studentCsv.charCodeAt(0) === 0xFEFF &&
    r.studentCsv.indexOf("Name,Email,Account,License,Expires,Devices,Last active,Joined") === 1 &&
    r.studentCsv.includes('"Aye, ""Ma"" Aye"') &&
    r.studentCsv.trim().split(/\r\n/).length === 24 &&
    /^hnk-students-\d{4}-\d{2}-\d{2}\.csv$/.test(r.studentCsvName),
    { name: r.studentCsvName, lines: r.studentCsv.trim().split(/\r\n/).length, head: r.studentCsv.slice(1, 70) });

  report("B5) the export walks the pages of the filter that is on screen and stops on the short page, rather than asking for ever",
    r.pagesAsked.join(",") === "1,2", r.pagesAsked);

  report("B6) the activity export writes its own seven headings and the event on screen",
    r.historyCsv.charCodeAt(0) === 0xFEFF &&
    r.historyCsv.indexOf("Time,Name,Email,Activity,Device,Result,Detail") === 1 &&
    r.historyCsv.includes("aye@example.com") &&
    /^hnk-activity-\d{4}-\d{2}-\d{2}\.csv$/.test(r.historyCsvName),
    { name: r.historyCsvName, head: r.historyCsv.slice(1, 70) });

  report("B7) on a 390px phone every button this wave added is at least 44 x 44, and the console still does not scroll sideways",
    r.reach.small.length === 0 && r.reach.overflow <= 0, r.reach);

  report("B8) the same three things in Burmese, the language the console boots in",
    /CSV/.test(r.burmese.exportWord) && !/Export/.test(r.burmese.exportWord) &&
    /[က-႟]/.test(r.burmese.relHead), r.burmese);

  report("B9) no page error anywhere in the walk", r.errs.length === 0, r.errs);

  /* ===================== C) the release chain ===================== */
  report(`C1) ${VER} / panel ${PVER} in lockstep on the app, the API, the panel and the download footer`,
    has(read("docs/app/index.html"), `var APP_VER="${VER}";`) &&
    has(read("docs/app/version.json"), `"v":"${VER}"`) &&
    has(read("server/index.js"), `const API_VERSION = "${VER}";`) &&
    has(read("panel/main.js"), `const PANEL_VERSION = "${PVER}";`) &&
    has(read("docs/download/index.html"), `Web App ${VER} · Panel ${PVER}`), null);

  report(`C2) CI runs this test and the suite counts ${COUNT} invocations`,
    has(CI, "node test/verify_admin_wave_6130.js") &&
    (CI.match(/node test\//g) || []).length === COUNT &&
    has(read("docs/index.html"), `${COUNT} tests`), { steps: (CI.match(/node test\//g) || []).length });

  console.log(`\nverify_admin_wave_6130: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(error => { console.error("FAIL — harness", error); process.exit(1); });
