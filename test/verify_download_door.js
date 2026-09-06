/* v6.28.0 — ONE DOWNLOAD DOOR.

   Owner decision (2026-09-06): the Photoshop Panel is downloaded from the web
   app's Account → Photoshop Panel group and nowhere else. The unified API had
   issued its one-time, five-minute delivery to a signed-in WEB session only
   since v6.51.0; the other two doors — the website's /download/ route with a
   sign-in flow of its own, and the panel's button that asked for the file and
   fell back to the web app when refused — were two more places to explain,
   audit and keep in step. This wave closes them:

     - docs/download/ forwards to ../app/?panel=download (meta refresh + link);
       its own script and stylesheet are gone. Old links and bookmarks land on
       the same door.
     - every in-app "Photoshop Panel download" link opens the account card's
       Panel group in place (the ?panel=download intent) instead of leaving.
     - the panel's button opens the web app on that group; it never asks the
       API for the file.
     - the server still issues to web sessions only.

   Source pins first, then the doors are DRIVEN: the dashboard and tutorial
   links open the group without reloading; the account-card button posts to
   /v1/downloads/panel and fetches the issued address; the forwarder, served
   from a docs-root server, lands in the web app with the intent alive.

   Requires docs/app served on http://127.0.0.1:${PORT||8931}/ . The forwarder
   check serves docs/ itself on 8938. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const net = require("net");
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const { withPremium, premiumEntitlement } = require("./_seed_premium.js");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 8931;
const DOCS_PORT = 8938;
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = rel => fs.existsSync(path.join(ROOT, rel));
let pass = 0, fail = 0;
function report(name, ok, detail) {
  if (ok) { pass++; console.log("PASS — " + name + (detail !== undefined ? "  :: " + JSON.stringify(detail).slice(0, 400) : "")); }
  else { fail++; console.log("FAIL — " + name + (detail !== undefined ? "  :: " + JSON.stringify(detail).slice(0, 600) : "")); }
}

const APP = read("docs/app/index.html");
const DL = read("docs/download/index.html");
const PANEL = read("panel/main.js");
const V1 = read("server/lib/v1.js");
const LANDING = read("docs/index.html");
const CI = read(".github/workflows/test.yml");

/* ---- A) the website route is a forwarder ---- */
report("A) /download/ forwards into the web app's account card: meta refresh + a visible link to ../app/?panel=download, noindex, no script / fetch / storage / sign-in of its own",
  /<meta http-equiv="refresh" content="0; url=\.\.\/app\/\?panel=download">/.test(DL) &&
  /<a class="btn" href="\.\.\/app\/\?panel=download">/.test(DL) &&
  /name="robots" content="noindex,nofollow"/.test(DL) &&
  !/<script/i.test(DL) && !/fetch\(|\/v1\/|localStorage|sessionStorage|password/i.test(DL));
report("A2) the route's own script and stylesheet are gone",
  !exists("docs/download/download.js") && !exists("docs/download/download.css") && !/download\.(js|css)/.test(DL));
const styleBody = (DL.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
const styleHash = "sha256-" + crypto.createHash("sha256").update(styleBody, "utf8").digest("base64");
const csp = (DL.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
report("A3) the forwarder's CSP allows nothing but its own hashed stylesheet",
  /default-src 'none'/.test(csp) && csp.includes("style-src '" + styleHash + "'") && !/script-src|connect-src/.test(csp), { csp });
report("A4) panel-version.json stays where the panel's update probe reads it",
  exists("docs/download/panel-version.json") && PANEL.includes("/download/panel-version.json"));

/* ---- B) the web app's doors ---- */
const intentDoors = (APP.match(/<a class="btn(?: btn-gold)?" href="\?panel=download" data-panel-intent>/g) || []).length;
report("B) every in-app door is the account card's own intent: no link leaves for ../download/, the dashboard and tutorial links carry the intent, the account-card button keeps ?panel=download as its no-script fallback",
  !APP.includes('href="../download/"') && intentDoors === 2 &&
  APP.includes('<a class="btn btn-gold grow" id="accPanelDownload" href="?panel=download" style="text-align:center"></a>') &&
  !APP.includes("Open secure download area"), { intentDoors });
report("B2) unifiedWire opens the intent in place for those links (no reload) and still binds both explicit controls to the request",
  APP.includes('document.querySelectorAll("a[data-panel-intent]").forEach(function(a){ a.addEventListener("click",function(ev){ if(ev&&ev.preventDefault) ev.preventDefault(); accPanelIntentStart(); }); });') &&
  APP.includes('dl.onclick=accRequestPanelDownload') && APP.includes('ad.addEventListener("click",accRequestPanelDownload)'));
const requester = (APP.match(/async function accRequestPanelDownload\(ev\)\{[\s\S]*?\n\}/) || [""])[0];
report("B3) the request itself is unchanged: POST /v1/downloads/panel from the account card, same-origin delivery address, no device id round-trip",
  requester.includes('accFetch("/v1/downloads/panel",{method:"POST"') && requester.includes("u.origin!==location.origin") &&
  !/computer_installation_id|installation_hash/.test(requester));
report("B4) What's New names the one door (my + en)",
  /\{ v:"6\.28\.0", kind:"page", ref:"pgHome",\n\s+t:\{my:"[^"]*Web App[^"]*",en:"[^"]*one place[^"]*Web App/.test(APP));

/* ---- C) the panel and the server ---- */
const getUpdate = (PANEL.match(/async function panelGetUpdate\(\) \{[\s\S]*?\n\}/) || [""])[0];
report("C) the panel's button opens the web app's door and never asks the API for the file",
  getUpdate.includes('await openUrl(APP_URL + "?panel=download");') && getUpdate.includes('sl("upd_web")') &&
  !getUpdate.includes("/v1/downloads/panel") && !PANEL.includes('gateReq("/v1/downloads/panel"') &&
  PANEL.includes('const APP_URL = "https://hnkaistudio.com/app/";'));
report("C2) the panel says so in all nine languages, and the fetch/save strings are gone",
  (PANEL.match(/^\s*upd_web: "/mg) || []).length === 9 && !/upd_getting|upd_saved/.test(PANEL));
report("C3) the server issues the delivery to a web session only",
  /async function issueDownload\(identity, body, context\) \{\n\s+if \(identity\.clientType !== "web"\) throw new ApiError\(403,"A web session is required","client_type_mismatch"\);/.test(V1));
report("C4) the landing links no download route of its own",
  !/href="(?:\.\.\/|\/)?download\/"/.test(LANDING));
report("CI runs this test", CI.includes("node test/verify_download_door.js"));

/* ---- D) driven ---- */
function entitledWithComputer() {
  const e = premiumEntitlement();
  e.devices.computer = { id: "dev-fixture-pc", label: "Test PC", installed_at: "2026-01-01T00:00:00Z" };
  e.allowed.ccx_download = true; e.reasons.ccx_download = "allowed";
  e.panel = { latest_version: "6.97.0", minimum_supported_version: "6.24.0" };
  return e;
}
function waitPort(port, ms) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function tryOnce() {
      const s = net.connect(port, "127.0.0.1");
      s.once("connect", () => { s.destroy(); resolve(); });
      s.once("error", () => { s.destroy(); if (Date.now() - t0 > ms) reject(new Error("port " + port + " never opened")); else setTimeout(tryOnce, 150); });
    })();
  });
}
async function armPage(page, errs) {
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.route("**/api/v1/me/entitlement", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(entitledWithComputer()) }));
}

(async () => {
  const browser = await chromium.launch();
  withPremium(browser);
  const errs = [];

  /* the in-app doors, on the suite's own server */
  const ctx = await browser.newContext({ viewport: { width: 412, height: 900 } });
  const page = await ctx.newPage(); await armPage(page, errs);
  const calls = []; page.on("request", r => { if (/\/api\/v1\/downloads\/panel/.test(r.url())) calls.push(r.method() + " " + new URL(r.url()).pathname); });
  await page.route("**/api/v1/downloads/panel", route => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, download_url: "/api/v1/downloads/panel/test-token-1", expires_at: new Date(Date.now() + 300000).toISOString(), token_id: "t1", version: "6.97.0" }) }));
  await page.route("**/api/v1/downloads/panel/test-token-1", route => route.fulfill({ status: 200, contentType: "application/octet-stream",
    headers: { "content-disposition": 'attachment; filename="HNK_Ai_Panel_v6.97.0.ccx"' }, body: "PK-test" }));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); } catch (e) {} });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  const door = async (which) => page.evaluate((which) => {
    window.__mark = (window.__mark || 0) + 1;
    _panelDownloadIntent = false; _panelDownloadStage = "";
    const links = Array.from(document.querySelectorAll("a[data-panel-intent]"));
    const a = which === "dash" ? links[0] : links[1];
    if (!a) return { missing: true };
    const href0 = location.href;
    a.click();
    return new Promise(res => setTimeout(() => res({
      mark: window.__mark, sameUrl: location.href === href0, stage: _panelDownloadStage, intent: _panelDownloadIntent,
      panelOpen: document.getElementById("accGrpPanel").classList.contains("open"),
      focused: document.activeElement && document.activeElement.id, home: document.getElementById("pgHome").classList.contains("on"),
      canDownload: unifiedCanDownload() }), 700));
  }, which);
  const d1 = await door("dash");
  report("D) the dashboard's Photoshop Panel download link opens the account card's Panel group in place — no reload, intent consumed, button focused",
    d1.mark === 1 && d1.sameUrl && d1.stage === "done" && d1.intent === false && d1.panelOpen && d1.focused === "accPanelDownload" && d1.home && d1.canDownload, d1);
  await page.evaluate(() => switchPage("pgTutorials")); await page.waitForTimeout(200);
  const d2 = await door("tut");
  report("D2) the Tutorials card's link does the same from another page",
    d2.mark === 2 && d2.sameUrl && d2.stage === "done" && d2.panelOpen && d2.focused === "accPanelDownload" && d2.home, d2);
  await page.evaluate(() => document.getElementById("accPanelDownload").click());
  await page.waitForTimeout(900);
  report("D3) the account-card button posts to /v1/downloads/panel and fetches the issued one-time address — the door still delivers",
    calls.includes("POST /api/v1/downloads/panel") && calls.includes("GET /api/v1/downloads/panel/test-token-1"), calls);
  await ctx.close();

  /* the forwarder, served from a docs-root server so ../app/ resolves */
  const srv = spawn("python3", ["-m", "http.server", String(DOCS_PORT), "--bind", "127.0.0.1"], { cwd: path.join(ROOT, "docs"), stdio: "ignore" });
  try {
    await waitPort(DOCS_PORT, 8000);
    const ctx2 = await browser.newContext({ viewport: { width: 412, height: 900 } });
    const p2 = await ctx2.newPage(); await armPage(p2, errs);
    await p2.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); } catch (e) {} });
    await p2.goto(`http://127.0.0.1:${DOCS_PORT}/download/`, { waitUntil: "domcontentloaded" });
    let landed = true;
    try { await p2.waitForURL(/\/app\/\?panel=download$/, { timeout: 8000 }); } catch (e) { landed = false; }
    await p2.waitForTimeout(2600);
    const f = landed ? await p2.evaluate(() => ({ url: location.pathname + location.search, stage: _panelDownloadStage,
      panelOpen: document.getElementById("accGrpPanel").classList.contains("open"), focused: document.activeElement && document.activeElement.id })) : { url: p2.url() };
    report("E) the old website route forwards into the web app with the intent alive: /download/ → /app/?panel=download → the Panel group opens",
      landed && f.stage === "done" && f.panelOpen && f.focused === "accPanelDownload", f);
    await ctx2.close();
  } finally { try { srv.kill(); } catch (e) {} }

  report("F) no page error while the doors were driven", errs.length === 0, errs);
  await browser.close();
  console.log(`\n${fail ? "FAIL" : "PASS"} (${pass} passed, ${fail} failed)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
