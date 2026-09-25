"use strict";
/* verify_usage_ledger_6131.js — 6.131.0 / panel 6.202.0
   THE ADMIN CONSOLE, WAVE B: THE USAGE LEDGER.

   MEASURED BEFORE A LINE WAS WRITTEN. rhBookSpend has booked every paid run
   since 6.94.0 — into `state.spend` in the student's own browser, and nowhere
   else. `grep -c "usage\|spend" server/index.js server/lib/admin-api.js`
   returned 0 and 0: there was no route, no table and no column anywhere on the
   server. The teacher who pays the RunningHub bill could see who signed in and
   never what anyone actually ran.

   WHAT THIS WAVE ADDS, AND THE LINE IT DOES NOT CROSS. Both surfaces now file
   one row per finished run — task id, kind of tool, the card's own label, and
   what RunningHub charged. Never a prompt, never a photograph, never a result.
   The surface is taken from the session's own client type, not from the body,
   so a web token cannot file a run as the panel's. The report is fire and
   forget and wrapped on both surfaces: a ledger entry that cannot be filed
   must not turn a generate that already succeeded into an error on the
   student's screen.

   A) the source   B) a real database and the real API   C) the console, booted
   D) the app and the panel really post   E) the release chain

   B needs a PostgreSQL server (CI supplies one; locally
   `service postgresql start`). It does not skip: with no server it FAILS.
   Usage: PORT=8931 node test/verify_usage_ledger_6131.js */
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawnSync } = require("child_process");
const { chromium } = require("playwright-core");
const WN = require("./lib/whats-new.js");

const ROOT = path.resolve(__dirname, "..");
const DOCS = path.join(ROOT, "docs");
const PANEL = path.join(ROOT, "panel");
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;

const SCHEMA = read("server/sql/schema.sql");
const MIGRATE = read("server/lib/migrate.js");
const V1 = read("server/lib/v1.js");
const API = read("server/lib/admin-api.js");
const ACTIONS = read("server/lib/admin.js");
const HTML = read("docs/admin/index.html");
const CSS = read("docs/admin/admin.css");
const JSRC = read("docs/admin/admin.js");
const APP = read("docs/app/index.html");
const MAIN = read("panel/main.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const VER = "6.135.0", PVER = "6.206.0", COUNT = 277;
const WAVE_V = "6.131.0";   /* this wave's own What's New row; VER moves on with every release */
const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webm": "video/webm" };

let pass = 0, fail = 0;
function report(name, ok, detail) {
  if (ok) { pass++; console.log("PASS — " + name); }
  else { fail++; console.log("FAIL — " + name + (detail === undefined ? "" : "  :: " + JSON.stringify(detail).slice(0, 700))); }
}

/* ===================== A) the source ===================== */
report("A1) the ledger is a real table with a real shape: one row per (student, task), two indexes for the two reads the console makes, and the boot migration REQUIRES it to carry FORCE RLS",
  /create table if not exists public\.usage_events \(/.test(SCHEMA) &&
  /unique \(user_id, task_id\)/.test(SCHEMA) &&
  /check \(surface in \('web','panel'\)\)/.test(SCHEMA) &&
  /usage_events_user_time_idx\s+on public\.usage_events \(user_id, created_at desc\)/.test(SCHEMA) &&
  /usage_events_time_idx\s+on public\.usage_events \(created_at desc\)/.test(SCHEMA) &&
  /alter table public\.usage_events enable row level security;/.test(SCHEMA) &&
  /alter table public\.usage_events force row level security;/.test(SCHEMA) &&
  /"usage_events",/.test(MIGRATE), null);

report("A2) nothing but the service context may touch it — no grant to authenticated, and the one policy is the service-role policy student_notes established",
  /create policy usage_events_service_all on public\.usage_events/.test(SCHEMA) &&
  /public\.usage_events,?/.test(SCHEMA.slice(SCHEMA.indexOf("revoke all on public.roles"))) &&
  !/grant [a-z, ]+ on public\.usage_events to authenticated/.test(SCHEMA) &&
  (SCHEMA.match(/create policy usage_events_/g) || []).length === 1, null);

report("A3) the write route sits behind requireIdentity, takes the surface from the session rather than the body, bounds every field, and a repeated task id writes nothing twice",
  V1.indexOf("if (pathname===\"/v1/usage\"&&method===\"POST\")") > V1.indexOf("requireIdentity(identity);") &&
  /const surface=identity\.clientType==="panel"\?"panel":"web";/.test(V1) &&
  /on conflict \(user_id,task_id\) do nothing/.test(V1) &&
  /const USAGE_TASK_RE=\/\^\[A-Za-z0-9\._:-\]\{1,128\}\$\//.test(V1) &&
  /const USAGE_TEXT_MAX=80;/.test(V1) && /const USAGE_MONEY_MAX=100000;/.test(V1) &&
  /replace\(\/\[\\u0000-\\u001f\\u007f\]\/g,""\)/.test(V1), null);

report("A4) the row carries no prompt, no photograph and no result — the insert names exactly the eight columns the ledger is made of",
  /insert into public\.usage_events \(user_id,task_id,surface,kind,label,money,coins,currency\)/.test(V1) &&
  !/prompt/.test(V1.slice(V1.indexOf("async function recordUsage"), V1.indexOf("async function handle"))), null);

report("A5) the admin read is its own gated action, and its three totals are window functions over the WHOLE filter rather than the page on screen",
  /"view_usage",/.test(ACTIONS) &&
  /requireAdmin\(identity,"view_usage"\);/.test(API) &&
  /count\(\*\) over\(\)::int as total_count/.test(API) &&
  /sum\(e\.money\) over\(\)::float8 as total_money/.test(API) &&
  /sum\(e\.coins\) over\(\)::float8 as total_coins/.test(API) &&
  /if \(pathname==="\/v1\/admin\/usage"&&method==="GET"\)/.test(V1), null);

report("A6) the console carries the surface in its markup — a fifth nav panel, its own filter bar, a totals strip, the five-column table, the card list, pagination and a door from the student's record",
  has(HTML, 'data-panel="usage"') && has(HTML, 'id="panel-usage"') &&
  has(HTML, 'id="usageFilters"') && has(HTML, 'id="usageSurface"') &&
  has(HTML, 'id="usageTotals"') && has(HTML, 'id="usageRows"') && has(HTML, 'id="usageCards"') &&
  has(HTML, 'id="usageEmpty"') && has(HTML, 'id="usagePrev"') && has(HTML, 'id="usageNext"') &&
  has(HTML, 'id="exportUsage"') && has(HTML, 'id="reloadUsage"') && has(HTML, 'id="viewStudentUsage"'), null);

report("A7) the console's own code routes the panel, loads it with wave A's skeleton, exports it with wave A's CSV engine, and gives the surface a plain chip rather than statusPill — whose class name is the word it is handed, which in Burmese would be the translated word",
  has(JSRC, 'usage: "/api/v1/admin/usage"') &&
  has(JSRC, 'if (name === "usage") loadUsage();') &&
  has(JSRC, 'setBusy("#usageRows", "#usageCards", true') &&
  has(JSRC, "async function exportUsage()") && has(JSRC, "hnk-usage-") &&
  has(JSRC, 'className: "surface-chip", text: surfaceLabel(item.surface)') &&
  !/statusPill\(item\.surface/.test(JSRC), null);

report("A8) the stylesheet gives the totals strip and the surface chip their own rules, and the strip becomes one column on a phone",
  has(CSS, ".usage-totals") && has(CSS, ".usage-total") && has(CSS, ".surface-chip") &&
  has(CSS, ".cell-cost") && /@media\(max-width:1000px\)\{\.usage-totals\{grid-template-columns:1fr\}\}/.test(CSS), null);

report("A9) every line this wave adds is in the console's second language",
  ["nav.usage", "us.eyebrow", "us.head", "us.sub", "us.export", "us.refresh", "us.searchLabel",
   "us.surfaceLabel", "us.allSurfaces", "us.web", "us.panel", "us.empty", "us.runs", "us.money",
   "us.coins", "us.whole", "us.free", "th.tool", "th.where", "th.cost", "ph.searchUsage", "dl.openUsage"]
    .every(key => new RegExp('"' + key.replace(".", "\\.") + '":\\s*"[^"]+"').test(JSRC)), null);

report("A10) the cache token is the console's own content, so wave B cannot ship behind wave A's URL",
  ["admin.css", "admin.js"].every(file => {
    const token = crypto.createHash("sha256").update(fs.readFileSync(path.join(DOCS, "admin", file))).digest("hex").slice(0, 12);
    return has(HTML, `${file}?v=${token}`);
  }), null);

report("A11) both surfaces report from the one place every paid run already passes through, fire and forget, wrapped, and refusing to send without a session",
  /try\{ usageReport\(taskId, meta, u\); \}catch\(e\)\{\}/.test(APP) &&
  /if\(!\(acc\.sess && acc\.sess\.access\)\) return false;/.test(APP) &&
  /accFetch\("\/v1\/usage", \{ method:"POST"/.test(APP) &&
  /try \{ usageReport\(taskId, meta, u\); \} catch \(e\) \{ \}/.test(MAIN) &&
  /if \(!\(gateS\.sess && gateS\.sess\.access\)\) return false;/.test(MAIN) &&
  /gateReq\("\/v1\/usage", \{/.test(MAIN), null);

const wn = WN.appRow(WAVE_V, "pgAccount");
const wnP = WN.panelRow(WAVE_V, "pgAccount");
const tests = parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10);
report(`A12) CI runs this test, the suite counts ${COUNT} invocations, the landing says so, and What's New carries the ${WAVE_V} row in nine languages on the app and the panel`,
  has(CI, "node test/verify_usage_ledger_6131.js") &&
  (CI.match(/node test\//g) || []).length === COUNT &&
  tests === COUNT && has(LANDING, `${COUNT} tests`) &&
  !!wn && LANGS.every(l => (wn.match(new RegExp("(^|[,{])" + l + ':"', "g")) || []).length === 2) &&
  !!wnP && wnP === wn,
  { steps: (CI.match(/node test\//g) || []).length, tests });

/* ===================== B) a real database and the real API ===================== */
const SUFFIX = String(process.pid);
const DB = "hnk_usage_probe_" + SUFFIX;
const RUNTIME = "hnk_usage_runtime_" + SUFFIX;
const PASSWORD = "usage-probe";
const STUDENT = "eeeeeeee-0000-4000-8000-000000000001";
const OTHER = "eeeeeeee-0000-4000-8000-000000000002";
const ADMIN = "eeeeeeee-0000-4000-8000-0000000000ad";

const ADMIN_ENV = Object.assign({}, process.env, {
  PGHOST: process.env.PGHOST || "127.0.0.1",
  PGPORT: process.env.PGPORT || "5432",
  PGUSER: process.env.PGUSER || "postgres",
  PGPASSWORD: process.env.PGPASSWORD || "postgres",
  PGCLIENTENCODING: "UTF8",
});
delete ADMIN_ENV.PGOPTIONS;
const RUNTIME_ENV = Object.assign({}, ADMIN_ENV, { PGUSER: RUNTIME, PGPASSWORD: PASSWORD });

function psql(args, env = ADMIN_ENV) {
  const child = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"].concat(args),
    { env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (child.error) return { ok: false, out: child.error.message };
  return { ok: child.status === 0, out: ((child.stdout || "") + (child.stderr || "")).trim() };
}
const sql = (text, db = "postgres") => psql(["-d", db, "-c", text]);
function asRole(role, uid, text) {
  const ctx = `select set_config('request.role','${role}',false), ` +
    `set_config('request.jwt.claim.sub','${uid}',false), ` +
    `set_config('request.is_admin','false',false), set_config('request.user_email','',false)`;
  const r = psql(["-d", DB, "-c", ctx, "-c", text], RUNTIME_ENV);
  return { ok: r.ok, out: r.out.split(/\r?\n/).slice(1).join("\n").trim() };
}
function cleanup() {
  sql(`select pg_terminate_backend(pid) from pg_stat_activity where datname='${DB}'`);
  sql(`drop database if exists "${DB}"`);
  sql(`drop role if exists "${RUNTIME}"`);
}
const member = (uid, clientType) => ({ valid: true, uid, clientType, roles: [], mfaEnrolled: false, mfaVerified: false });
const adminId = { valid: true, uid: ADMIN, clientType: "admin", roles: ["admin"], mfaEnrolled: false, mfaVerified: false };
async function call(v1, input) {
  try { return await v1.handle(input); }
  catch (error) { return { status: error.status || 500, code: error.code || "", message: error.message }; }
}

/* ===================== C) the console, booted ===================== */
function staticServer(rootDir) {
  return http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    const file = path.resolve(rootDir, "." + pathname);
    if (!file.startsWith(rootDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end("no"); return; }
    res.writeHead(200, { "Content-Type": (MIME[path.extname(file).toLowerCase()] || "application/octet-stream") + "; charset=utf-8", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
}
const PAGE_SIZE = 20;
function usagePage(page) {
  const runs = [];
  const many = page === 1 ? PAGE_SIZE : 4;
  for (let i = 0; i < many; i += 1) {
    const n = (page - 1) * PAGE_SIZE + i + 1;
    runs.push({ id: "run-" + n, created_at: "2026-09-21T02:00:00Z", task_id: "task-" + n,
      surface: n % 2 ? "web" : "panel", kind: n % 3 ? "image" : "video",
      label: n === 1 ? 'Glass Skin, "Studio"' : "Card " + n, currency: "USD",
      money: 0.0125, coins: 12, name: "Student " + n, email: `s${n}@example.com` });
  }
  return { runs, page, total: PAGE_SIZE + 4,
    totals: { runs: PAGE_SIZE + 4, money: 0.3, coins: 288, currency: "USD" } };
}

async function consoleWalk() {
  const server = staticServer(DOCS);
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", e => e ? reject(e) : resolve()));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const out = { errs: [] };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", e => out.errs.push(String(e).slice(0, 200)));
  const asked = [];
  try {
    await page.addInitScript(() => { localStorage.setItem("hnk_admin_lang_v1", "en"); });
    await page.route("**/api/**", async route => {
      const url = route.request().url();
      const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.includes("grant_type=password")) return json(200, { access_token: "A", refresh_token: "R", expires_at: 1999999999, session_id: "s", user: { id: "admin-1", email: "owner@example.com" } });
      if (url.includes("/api/health")) return json(200, { ok: true, apiVersion: VER });
      if (url.includes("/admin/session")) return json(200, { admin: { id: "admin-1", email: "owner@example.com", role: "admin" } });
      if (url.includes("/dashboard")) return json(200, { total: 3, active: 3, pending: 0, online: 1, latest_logins: [], signups: [] });
      if (url.includes("/visits")) return json(200, { days: [], pages: [] });
      if (url.includes("/panel-version")) return json(200, { latest_version: PVER, minimum_supported_version: "6.24.0" });
      if (url.includes("/admin/usage")) {
        const q = new URL(url).searchParams;
        asked.push({ page: Number(q.get("page") || 1), surface: q.get("surface") || "", q: q.get("q") || "" });
        return json(200, usagePage(Number(q.get("page") || 1)));
      }
      if (/\/students(?:\?|$)/.test(url)) return json(200, { students: [], page: 1, total: 0 });
      if (url.includes("/histories")) return json(200, { events: [], page: 1, total: 0 });
      return json(200, { ok: true });
    });
    await page.goto(`${origin}/admin/index.html`, { waitUntil: "load" });
    await page.fill("#adminLoginEmail", "owner@example.com");
    await page.fill("#adminLoginPassword", "secret");
    await page.click("#adminLoginButton");
    await page.waitForSelector("#adminApp:not([hidden])", { timeout: 20000 });
    await page.waitForTimeout(600);

    await page.evaluate(() => { document.querySelector('[data-panel="usage"]').click(); });
    await page.waitForFunction(() => document.getElementById("usageRows").getAttribute("aria-busy") === "false", null, { timeout: 20000 });
    out.table = await page.evaluate(() => ({
      rows: document.querySelectorAll("#usageRows tr").length,
      cards: document.querySelectorAll("#usageCards .history-card").length,
      first: [...document.querySelectorAll("#usageRows tr:first-child td")].map(td => td.textContent.trim()),
      chips: [...document.querySelectorAll("#usageRows .surface-chip")].map(c => c.textContent).slice(0, 4),
      totals: [...document.querySelectorAll(".usage-total")].map(t => ({
        label: t.querySelector("span").textContent, value: t.querySelector("b").textContent,
        note: t.querySelector("small").textContent })),
      empty: document.getElementById("usageEmpty").hidden,
      title: document.getElementById("pageTitle").textContent,
    }));

    asked.length = 0;
    const [csv] = await Promise.all([
      page.waitForEvent("download", { timeout: 20000 }),
      page.click("#exportUsage"),
    ]);
    out.csvName = csv.suggestedFilename();
    out.csv = fs.readFileSync(await csv.path(), "utf8");
    out.csvPages = asked.map(a => a.page);

    asked.length = 0;
    await page.selectOption("#usageSurface", "panel");
    await page.fill("#usageSearch", "Student 3");
    await page.click("#usageFilters button[type=submit]");
    await page.waitForTimeout(500);
    out.filtered = asked[0] || null;

    out.reach = await page.evaluate(() => {
      const small = [];
      ["#exportUsage", "#reloadUsage", "#usagePrev", "#usageNext"].forEach(sel => {
        const el = document.querySelector(sel);
        if (!el) { small.push(sel + ":missing"); return; }
        const r = el.getBoundingClientRect();
        if (r.height && (r.height < 44 || r.width < 44)) small.push(`${sel}:${Math.round(r.width)}x${Math.round(r.height)}`);
      });
      return { small, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });

    await page.evaluate(() => { document.getElementById("langToggle").click(); });
    await page.waitForTimeout(300);
    out.burmese = await page.evaluate(() => ({
      nav: [...document.querySelectorAll('[data-panel="usage"] span')].map(s => s.textContent).join(""),
      head: document.querySelector("#panel-usage h2").textContent,
      chip: (document.querySelector("#usageRows .surface-chip") || {}).textContent || "",
      chipClass: (document.querySelector("#usageRows .surface-chip") || {}).className || "",
    }));
  } finally {
    await ctx.close(); await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  return out;
}

/* ===================== D) the app and the panel really post ===================== */
const PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function appWalk(port) {
  const browser = await chromium.launch({ headless: true });
  const out = { posts: [], errs: [] };
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", e => out.errs.push(String(e).slice(0, 200)));
  try {
    await page.route("**/*", route => {
      const url = route.request().url();
      /* the web app's API is same-origin (/api), so the ledger's POST is caught
         BEFORE the "let the local server serve it" branch */
      if (/\/api\/v1\/usage$/.test(url)) {
        out.posts.push({ url, method: route.request().method(),
          auth: route.request().headers()["authorization"] || "",
          body: route.request().postData() || "" });
        return route.fulfill({ status: 202, contentType: "application/json", body: '{"ok":true}' });
      }
      if (url.indexOf("127.0.0.1:" + port) >= 0) return route.continue();
      if (route.request().resourceType() === "image")
        return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from(PX, "base64") });
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(1200);
    out.run = await page.evaluate(() => {
      acc.sess = { access: "APP-TOKEN", refresh: "r", uid: "u-1", exp: Math.floor(Date.now() / 1000) + 3600 };
      RH_LAST_CUR = "USD";
      /* the shape RunningHub really answers with, the one rhUsageOf reads */
      rhBookSpend("task-web-1", { kind: "image", label: "Glass Skin", prov: "rh" },
        { code: 0, data: { usage: { consumeMoney: 0.0125, consumeCoins: 12, taskCostTime: 3 } } });
      /* the same run again — the ledger must not double-count, and the client
         must not stop reporting because it already did */
      /* the app's own ledger lives in browser storage, not in state */
      return { hasReporter: typeof usageReport === "function", booked: spendLoad().rows.length };
    });
    await page.waitForTimeout(400);
    /* a refused report must leave the generate alone */
    out.refused = await page.evaluate(async () => {
      const real = window.fetch;
      window.fetch = () => Promise.reject(new Error("no line"));
      let threw = false;
      try { rhBookSpend("task-web-2", { kind: "video", label: "Clip" },
        { code: 0, data: { usage: { consumeMoney: 0, consumeCoins: 0 } } }); }
      catch (e) { threw = true; }
      window.fetch = real;
      await new Promise(r => setTimeout(r, 120));
      return { threw };
    });
  } finally { await browser.close(); }
  return out;
}

async function panelWalk() {
  const { UXP_STUB } = require("./lib/panel-parity-harness.js");
  const server = staticServer(PANEL);
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", e => e ? reject(e) : resolve()));
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const out = { posts: [], errs: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    page.on("pageerror", e => out.errs.push(String(e).slice(0, 240)));
    await page.route("**/*", route => {
      const url = route.request().url();
      if (url.indexOf("127.0.0.1:" + port) >= 0) return route.continue();
      if (/\/v1\/usage$/.test(url)) {
        out.posts.push({ url, method: route.request().method(),
          auth: route.request().headers()["authorization"] || "",
          body: route.request().postData() || "" });
        return route.fulfill({ status: 202, contentType: "application/json", body: '{"ok":true}' });
      }
      if (route.request().resourceType() === "image")
        return route.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") });
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.addInitScript(UXP_STUB);
    await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.waitForFunction(() => {
      try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; }
    }, null, { timeout: 20000 }).catch(() => { throw new Error("the panel never reached its signed-in state"); });
    out.run = await page.evaluate(() => {
      gateS.sess = gateS.sess || {};
      gateS.sess.access = "PANEL-TOKEN";
      state.rhLastCur = "USD";
      /* the panel's harness answers every off-machine address inside the page, so
         Playwright's router never sees the call. The recorder therefore sits on
         window.fetch — which is exactly where hnkFetch leaves it — and reads the
         real url, method, header and body the panel builds. */
      const real = window.fetch;
      window.__usagePosts = [];
      window.fetch = function (url, init) {
        try {
          if (/\/v1\/usage$/.test(String(url))) window.__usagePosts.push({
            url: String(url), method: (init && init.method) || "GET",
            auth: (init && init.headers && (init.headers.Authorization || init.headers.authorization)) || "",
            body: (init && init.body) || "" });
        } catch (e) { }
        return real.apply(this, arguments);
      };
      /* through the panel's own bridge, the one every surface's runs go through */
      window.HNK.spendBook([{ taskId: "task-panel-1",
        final: { code: 0, data: { usage: { consumeMoney: 0.02, consumeCoins: 20, taskCostTime: 4 } } } }],
        { kind: "image", label: "Glass Skin", prov: "rh" });
      return { booked: (state.spend && state.spend.rows || []).length };
    });
    await page.waitForTimeout(500);
    out.posts = out.posts.concat(await page.evaluate(() => window.__usagePosts || []));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  return out;
}

(async () => {
  /* ---------- B ---------- */
  const probe = sql("select 1");
  if (!probe.ok) {
    report("B) a live database proves the ledger's shape, its privacy and its totals", false,
      "no local Postgres: " + probe.out.slice(0, 160));
  } else {
    cleanup();
    let r = sql(`create role "${RUNTIME}" login password '${PASSWORD}' nosuperuser nobypassrls nocreatedb`);
    if (r.ok) r = sql(`create database "${DB}" owner "${RUNTIME}"`);
    if (!r.ok) { report("B) scratch role and database", false, r.out.slice(0, 200)); cleanup(); process.exit(1); }

    const dbUrl = `postgres://${RUNTIME}:${PASSWORD}@${ADMIN_ENV.PGHOST}:${ADMIN_ENV.PGPORT}/${DB}`;
    const migrated = spawnSync("node",
      ["-e", 'require("./lib/migrate").migrate().then(()=>process.exit(0),e=>{console.error(e.message);process.exit(1);});'],
      { cwd: path.join(ROOT, "server"),
        env: Object.assign({}, ADMIN_ENV, { PGSSLMODE: "disable", ALLOW_UNVERIFIED_DB_TLS: "1", DATABASE_URL: dbUrl }),
        encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 180000 });
    report("B0) the scratch database carries the tracked schema, which the boot migration refuses to finish without usage_events under FORCE RLS",
      migrated.status === 0, ((migrated.stdout || "") + (migrated.stderr || "")).split(/\r?\n/).slice(-4));

    if (migrated.status === 0) {
      asRole("service_role", "", `
        insert into public.hnk_auth_users (id,email,encrypted_password,email_confirmed_at) values
          ('${STUDENT}','usage-a@x.test','x',now()),('${OTHER}','usage-b@x.test','x',now()),
          ('${ADMIN}','usage-admin@x.test','x',now()) on conflict do nothing;
        insert into public.profiles (id,name,email) values
          ('${STUDENT}','Aye Aye','usage-a@x.test'),('${OTHER}','Bo Bo','usage-b@x.test'),
          ('${ADMIN}','Teacher','usage-admin@x.test') on conflict do nothing`);

      process.env.DATABASE_URL = dbUrl;
      process.env.PGSSLMODE = "disable";
      process.env.ALLOW_UNVERIFIED_DB_TLS = "1";
      const v1 = require(path.join(ROOT, "server", "lib", "v1.js"));
      const db = require(path.join(ROOT, "server", "lib", "db.js"));

      const post = (identity, body) => call(v1, { pathname: "/v1/usage", method: "POST", body, identity, context: {} });
      const first = await post(member(STUDENT, "web"),
        { task_id: "t-web-1", kind: "image", label: "Glass Skin", money: 0.0125, coins: 12, currency: "USD" });
      const again = await post(member(STUDENT, "web"),
        { task_id: "t-web-1", kind: "image", label: "SOMETHING ELSE", money: 999, coins: 999, currency: "USD" });
      const rows1 = asRole("service_role", "",
        `select count(*)||'|'||max(surface)||'|'||max(label)||'|'||max(money) from public.usage_events where task_id='t-web-1'`);
      report("B1) a signed-in web session files one row, and the same task filed twice is still one row with the first answer's figures",
        first.status === 202 && again.status === 202 && rows1.out === "1|web|Glass Skin|0.012500",
        { first: first.status, again: again.status, row: rows1.out });

      /* the body cannot choose the surface: the same client sends surface:'panel' and is still web */
      await post(member(STUDENT, "web"), { task_id: "t-web-2", kind: "image", label: "Lie", surface: "panel" });
      const panelRun = await post(member(STUDENT, "panel"),
        { task_id: "t-pan-1", kind: "video", label: "Clip", money: 0.05, coins: 50, currency: "USD" });
      const surfaces = asRole("service_role", "",
        `select string_agg(task_id||'='||surface,',' order by task_id) from public.usage_events where user_id='${STUDENT}'`);
      report("B2) the surface is the session's own client type — a web token that claims to be the panel is still filed as web, and a panel token is filed as panel",
        panelRun.status === 202 && surfaces.out === "t-pan-1=panel,t-web-1=web,t-web-2=web", surfaces.out);

      const bad = await post(member(STUDENT, "web"), { task_id: "no spaces or slashes /" });
      const none = await call(v1, { pathname: "/v1/usage", method: "POST", body: { task_id: "t-x" }, identity: null, context: {} });
      report("B3) a task id outside the alphabet is refused 400, and no session at all is refused 401",
        bad.status === 400 && bad.code === "invalid_task_id" && none.status === 401,
        { bad: bad.status + "/" + bad.code, none: none.status });

      await post(member(OTHER, "web"), { task_id: "t-big", kind: "image\u0007x",
        label: "L".repeat(400), money: 1e9, coins: -5, currency: "USD" });
      const bounded = asRole("service_role", "",
        `select length(label)||'|'||money||'|'||coins||'|'||kind from public.usage_events where task_id='t-big'`);
      report("B4) a broken client cannot write a month's total into one row, nor a control character, nor a four-hundred-character label",
        bounded.out === "80|100000.000000|0.000|imagex", bounded.out);

      const studentSees = asRole("authenticated", STUDENT, "select count(*) from public.usage_events");
      asRole("authenticated", STUDENT, "delete from public.usage_events");
      const afterDelete = asRole("service_role", "", "select count(*) from public.usage_events");
      report("B5) the ledger is service-context-only: the student it is about sees none of it and cannot delete it",
        studentSees.out === "0" && afterDelete.out === "4",
        { visibleToStudent: studentSees.out, rowsAfterStudentDelete: afterDelete.out });

      const list = params => call(v1, { pathname: "/v1/admin/usage", method: "GET",
        identity: adminId, context: {}, params: new URLSearchParams(params) });
      const all = await list({ limit: "2", page: "1" });
      report("B6) the admin read returns the page asked for, and its totals count the whole filter rather than the page",
        all.status === 200 && all.body.runs.length === 2 && all.body.total === 4 &&
        all.body.totals.runs === 4 && Math.abs(all.body.totals.money - 100000.0625) < 0.001 &&
        all.body.totals.coins === 62 && all.body.totals.currency === "USD",
        all.body && { rows: all.body.runs.length, total: all.body.total, totals: all.body.totals });

      const onlyPanel = await list({ surface: "panel" });
      const byName = await list({ q: "Bo Bo" });
      const byStudent = await list({ student_id: STUDENT });
      report("B7) the filters are real: by surface, by free text over the student's name and the tool, and by one student",
        onlyPanel.body.total === 1 && onlyPanel.body.runs[0].task_id === "t-pan-1" &&
        byName.body.total === 1 && byName.body.runs[0].task_id === "t-big" &&
        byStudent.body.total === 3,
        { panel: onlyPanel.body.total, name: byName.body.total, student: byStudent.body.total });

      const asStudent = await call(v1, { pathname: "/v1/admin/usage", method: "GET",
        identity: member(STUDENT, "web"), context: {}, params: new URLSearchParams({}) });
      report("B8) a student asking for the ledger is refused — the read is an admin action, not a member one",
        asStudent.status === 403, { status: asStudent.status, code: asStudent.code });

      const named = await list({});
      report("B9) every row names the student, so the console never has to guess who ran it",
        named.body.runs.every(row => row.student_id && row.email) &&
        named.body.runs.some(row => row.name === "Aye Aye"),
        named.body.runs[0]);

      await db.pool.end().catch(() => {});
    }
    cleanup();
  }

  /* ---------- C ---------- */
  const c = await consoleWalk();
  report("C1) the Usage panel draws one row per run in the five-column shape, the same rows as cards for a phone, and the surface as a plain chip",
    c.table.rows === 20 && c.table.cards === 20 && c.table.first.length === 5 &&
    c.table.chips.slice(0, 2).join("|") === "Web app|Photoshop panel" && c.table.empty === true &&
    /Usage/.test(c.table.title), c.table);

  report("C2) the three totals carry the whole filter, not the twenty rows on screen, and say so",
    c.table.totals.length === 3 && c.table.totals[0].value === "24" &&
    c.table.totals[1].value === "0.30 USD" && c.table.totals[2].value === "288" &&
    c.table.totals.every(t => t.note === "whole filter"), c.table.totals);

  report("C3) the cost cell prints what RunningHub charged, in the currency it charged it in",
    /0\.0125 USD/.test(c.table.first[4]) && /12 RH/.test(c.table.first[4]), c.table.first);

  report("C4) the export writes a real CSV over the pages of the filter on screen, with the BOM Excel needs and a label holding a comma and a quote escaped",
    c.csv.charCodeAt(0) === 0xFEFF &&
    c.csv.indexOf("Time,Name,Email,Tool,Kind,Where,Money,Currency,Coins,Task") === 1 &&
    c.csv.includes('"Glass Skin, ""Studio"""') &&
    c.csv.trim().split(/\r\n/).length === 25 &&
    c.csvPages.join(",") === "1,2" &&
    /^hnk-usage-\d{4}-\d{2}-\d{2}\.csv$/.test(c.csvName),
    { name: c.csvName, lines: c.csv.trim().split(/\r\n/).length, pages: c.csvPages });

  report("C5) the filter bar really filters: the surface and the search reach the server, and the page resets to one",
    c.filtered && c.filtered.surface === "panel" && c.filtered.q === "Student 3" && c.filtered.page === 1, c.filtered);

  report("C6) on a 390px phone every control this wave added is at least 44 x 44 and the console still does not scroll sideways",
    c.reach.small.length === 0 && c.reach.overflow <= 0, c.reach);

  report("C7) the whole surface speaks the console's second language, and the chip's class name stays English so a translated word can never become a CSS class",
    /[က-႟]/.test(c.burmese.nav) && /[က-႟]/.test(c.burmese.head) &&
    /[က-႟]/.test(c.burmese.chip) && c.burmese.chipClass === "surface-chip", c.burmese);

  report("C8) no page error anywhere in the console walk", c.errs.length === 0, c.errs);

  /* ---------- D ---------- */
  const port = process.env.PORT || "8931";
  const a = await appWalk(port);
  const appPost = a.posts.find(p => /\/v1\/usage$/.test(p.url)) || null;
  const appBody = appPost ? JSON.parse(appPost.body || "{}") : {};
  report("D1) a finished run in the web app files one row and nothing else — the six fields, the session's token, and not one byte of the prompt, the photograph or the result",
    !!appPost && appPost.method === "POST" && /Bearer APP-TOKEN/.test(appPost.auth) &&
    Object.keys(appBody).sort().join(",") === "coins,currency,kind,label,money,task_id" &&
    appBody.task_id === "task-web-1" && appBody.label === "Glass Skin" &&
    appBody.money === 0.0125 && appBody.coins === 12 && appBody.currency === "USD",
    { post: appPost && { auth: appPost.auth, body: appPost.body }, booked: a.run });

  report("D2) a report that cannot be sent is dropped in silence — the generate that already succeeded does not become an error",
    a.refused.threw === false && a.errs.length === 0, { refused: a.refused, errs: a.errs });

  const p = await panelWalk();
  const panPost = p.posts.find(x => /\/v1\/usage$/.test(x.url)) || null;
  const panBody = panPost ? JSON.parse(panPost.body || "{}") : {};
  report("D3) the Photoshop panel files the same row, through its own gate helper, for a run booked by the bridge every panel surface uses",
    !!panPost && panPost.method === "POST" && /\/api\/v1\/usage$/.test(panPost.url) &&
    /Bearer PANEL-TOKEN/.test(panPost.auth) &&
    Object.keys(panBody).sort().join(",") === "coins,currency,kind,label,money,task_id" &&
    panBody.task_id === "task-panel-1" && panBody.label === "Glass Skin" && panBody.coins === 20,
    { post: panPost && { url: panPost.url, auth: panPost.auth, body: panPost.body }, errs: p.errs });

  /* ---------- E ---------- */
  report(`E1) ${VER} / panel ${PVER} in lockstep on the app, the API, the panel and the download footer`,
    has(read("docs/app/index.html"), `var APP_VER="${VER}";`) &&
    has(read("docs/app/version.json"), `"v":"${VER}"`) &&
    has(read("server/index.js"), `const API_VERSION = "${VER}";`) &&
    has(read("panel/main.js"), `const PANEL_VERSION = "${PVER}";`) &&
    has(read("docs/download/index.html"), `Web App ${VER} · Panel ${PVER}`), null);

  console.log(`\nverify_usage_ledger_6131: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(error => { try { cleanup(); } catch (_) {} console.error("FAIL — harness", error); process.exit(1); });
