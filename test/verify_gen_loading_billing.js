/* verify_gen_loading_billing.js — 6.128.0 / panel 6.199.0
 *
 * WHY THIS EXISTS. The owner asked one question — "does every Generate show
 * loading and billing?" — and walking both surfaces turned a yes into three
 * honest gaps:
 *
 *   1. BILLING. Every paid run funnels through one place (rhPollTracked on the
 *      app, the adapters' usage on the panel) and each books a ledger row and
 *      toasts what the run actually cost. But the BALANCE beside that toast
 *      only ever re-read on a saved key, on a cold boot older than an hour,
 *      and on the button. A student who ran ten jobs still saw the balance
 *      from before the first one — a true cost line next to a stale number.
 *   2. LOADING, app. Eight of the ten generate controls were inside the
 *      6.120.0 contract; Path and the V2 batch were not. They draw a progress
 *      bar and a log, so they need no skeleton, but their spinner was not a
 *      live region and their card never read busy: a screen reader heard
 *      nothing at all while forty photos ran.
 *   3. LOADING, panel. PEND_BOX_P named five pages from the first, and
 *      pendBoxP was only ever CALLED for two. Video Upscale, Video Tools and
 *      Talking Photo left their result card unmarked while the same three
 *      pages in the web app went to a skeleton.
 *
 * This test holds all three:
 *   A) the source — one debounced quiet read hung off the booking on both
 *      surfaces, ten entries in the app's table, five live calls in the panel.
 *   B) the app walked for real — the two batch cards go busy and clear, and a
 *      batch of three bookings asks the balance exactly once, after the delay
 *      and never before, and not at all without a key.
 *   C) the panel walked for real — the three video pages open and close the
 *      busy card, and their status line is the live region.
 *   D) the release pins.
 *
 * Fault injection: drop balAfterSpend from rhBookSpend and A1/B3 fail; drop
 * ptSpin from PEND_BOX and B1 fails; drop the pendBoxP call from vuRun and C1
 * fails with the card unmarked — the owner's third gap, exactly. */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const APP = read("docs/app/index.html");
const PMAIN = read("panel/main.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const PWN = read("panel/js/hnk_whats_new.js");
const PORT = process.env.PORT || "8931";
const VER = "6.130.0", PVER = "6.201.0";
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}

/* ===================== A) the source ===================== */
function sourcePins() {
  /* The booking is the only honest hook: it is what every paid run reaches,
     and it runs AFTER the charge exists. Hanging the read off the button, or
     off a page open, would go back to guessing. */
  report("A1) both surfaces re-read the balance from the booking itself, debounced, delayed and quiet",
    /spendAdd\(taskId, meta, u\);\s*\n\s*balAfterSpend\(\);/.test(APP) &&
    /spendAdd\(taskId, meta, u\);\s*\n\s*balAfterSpend\(\);/.test(PMAIN) &&
    /var BAL_AFTER_MS=6000, balAfterT=null;/.test(APP) && /const BAL_AFTER_MS = 6000;/.test(PMAIN) &&
    /clearTimeout\(balAfterT\)/.test(APP) && /clearTimeout\(balAfterT\)/.test(PMAIN) &&
    /moneyRefresh\(true\)/.test(APP) && /moneyRefresh\(true\)/.test(PMAIN), {
      app: /balAfterSpend\(\);/.test(APP), panel: /balAfterSpend\(\);/.test(PMAIN) });

  /* quiet means quiet: no disabled button, no red line, on either surface */
  report("A2) a quiet read touches neither the button nor the status line, so a background failure never marks a generate that worked",
    /async function moneyRefresh\(quiet\)\{/.test(APP) &&
    /var st=quiet\?null:\$\("stMoney"\);/.test(APP) &&
    /var btn=quiet\?null:\$\("btnMoneyRefresh"\);/.test(APP) &&
    /async function moneyRefresh\(quiet\) \{/.test(PMAIN) &&
    /const btn = quiet \? null : \$\("btnMoneyRefresh"\);/.test(PMAIN) &&
    /if \(!quiet\) stSet\("stMoney", sl\("money_fail"\)/.test(PMAIN), null);

  /* no key, no request — a balance read is never the thing that wakes a
     signed-out studio up */
  report("A3) with no key the schedule refuses outright on both surfaces",
    /function balAfterSpend\(\)\{\s*\n\s*if\(!state\.rhKey\) return false;/.test(APP) &&
    /function balAfterSpend\(\) \{\s*\n\s*if \(!state\.rhKey\) return false;/.test(PMAIN), null);

  /* the app's table: eight were in it, the two batch runners join */
  const tbl = (APP.match(/var PEND_BOX=\{[^;]*\};/) || [""])[0];
  const ids = (tbl.match(/([a-zA-Z0-9]+):\[/g) || []).map(x => x.replace(":[", ""));
  report("A4) all ten of the app's generate spinners are in the loading table — the eight from 6.120.0 plus Path and the V2 batch, both without a skeleton",
    ids.length === 10 && ids.indexOf("ptSpin") >= 0 && ids.indexOf("v2Spin") >= 0 &&
    /ptSpin:\["ptRunCard",0\]/.test(tbl) && /v2Spin:\["v2RunCard",0\]/.test(tbl) &&
    has(APP, 'id="v2RunCard"'), { ids });

  /* the panel's table named five from the first; what was missing was the
     calls. Two were there, three are new, and each opens AND closes. */
  const calls = {};
  ["spin", "vidSpin", "vuSpin", "vtSpin", "tkSpin"].forEach(id => {
    calls[id] = {
      on: has(PMAIN, 'pendBoxP("' + id + '", true)'),
      off: has(PMAIN, 'pendBoxP("' + id + '", false)')
    };
  });
  report("A5) the panel calls pendBoxP for all five pages its table names, opening and closing each — Video Upscale, Video Tools and Talking Photo were declared and never called",
    Object.keys(calls).every(k => calls[k].on && calls[k].off), calls);

  /* Talking Photo has no spinner line of its own, so the status line that
     carries "Working · stage · Ns" is what must be announced */
  report("A6) where a panel page has no spinner of its own, its status line is the live region",
    /const PEND_SAY_P = \{ spin: "stGen", vidSpin: "stVidGen", vuSpin: "stVuGen", vtSpin: "stVtGen", tkSpin: "stTkGen" \};/.test(PMAIN) &&
    /const sp = \$\(spinId\) \|\| \$\(PEND_SAY_P\[spinId\]\);/.test(PMAIN), null);
}

/* ===================== B) the app, walked ===================== */
async function appWalk(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  try {
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.$ === "function" && !!document.getElementById("spin"), null, { timeout: 30000 });
    await page.waitForTimeout(1400);

    const w = await page.evaluate(async () => {
      const rows = [];
      for (const id of ["ptSpin", "v2Spin"]) {
        const sp = document.getElementById(id);
        const boxId = window.PEND_BOX[id] && window.PEND_BOX[id][0];
        sp.classList.add("on");
        await new Promise(r => setTimeout(r, 80));
        const box = document.getElementById(boxId);
        const row = { id, box: boxId, role: sp.getAttribute("role"), live: sp.getAttribute("aria-live"),
          busy: !!(box && box.getAttribute("aria-busy") === "true"),
          /* a progress bar and a log of their own: no skeleton over them */
          skeleton: !!(box && box.classList.contains("pending")) };
        sp.classList.remove("on");
        await new Promise(r => setTimeout(r, 80));
        row.cleared = !document.getElementById(boxId).hasAttribute("aria-busy");
        rows.push(row);
      }

      /* the balance: no key refuses; a batch of three asks once, and only
         after the delay */
      const hadKey = state.rhKey;
      state.rhKey = "";
      const noKey = balAfterSpend();
      state.rhKey = "probe-key";
      let quiet = 0;
      const real = window.moneyRefresh;
      window.moneyRefresh = function (q) { if (q === true) quiet++; return Promise.resolve(true); };
      balAfterSpend(); balAfterSpend(); balAfterSpend();
      const early = quiet;
      await new Promise(r => setTimeout(r, window.BAL_AFTER_MS + 500));
      const late = quiet;
      window.moneyRefresh = real;
      state.rhKey = hadKey;
      return { rows, noKey, early, late, delay: window.BAL_AFTER_MS };
    });

    report("B1) Path's run card goes busy while the batch runs, its spinner is a live region, and the card clears when it stops",
      w.rows[0] && w.rows[0].busy && w.rows[0].cleared && w.rows[0].role === "status" &&
      w.rows[0].live === "polite" && w.rows[0].skeleton === false, w.rows[0]);
    report("B2) the V2 batch card does the same",
      w.rows[1] && w.rows[1].busy && w.rows[1].cleared && w.rows[1].role === "status" &&
      w.rows[1].live === "polite" && w.rows[1].skeleton === false, w.rows[1]);
    report("B3) three bookings ask the balance once, after the delay and never before, and not at all without a key",
      w.noKey === false && w.early === 0 && w.late === 1 && w.delay === 6000,
      { noKey: w.noKey, early: w.early, late: w.late, delay: w.delay });
    report("B4) no page error while all of that ran", errs.length === 0, errs);
  } finally {
    await page.close().catch(() => { });
  }
}

/* ===================== C) the panel, walked ===================== */
async function panelWalk(browser) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const page = await browser.newPage({ viewport: { width: 380, height: 900 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  try {
    await page.addInitScript(UXP_STUB);
    await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "load" });
    await page.waitForFunction(() => { try { return !!(window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash()); } catch (e) { return false; } },
      null, { timeout: 30000 }).catch(() => { throw new Error("the panel never reached the signed-in state"); });
    await page.waitForTimeout(1000);

    /* the panel's own function, driven exactly as the three runs drive it */
    const w = await page.evaluate(async () => {
      const out = {};
      for (const id of ["vuSpin", "vtSpin", "tkSpin"]) {
        const boxId = { vuSpin: "vuResultBox", vtSpin: "vtResultBox", tkSpin: "tkResultBox" }[id];
        const opened = pendBoxP(id, true);
        await new Promise(r => setTimeout(r, 60));
        const box = document.getElementById(boxId);
        const say = document.getElementById({ vuSpin: "stVuGen", vtSpin: "stVtGen", tkSpin: "stTkGen" }[id]);
        const row = { opened: opened, box: !!box, busy: !!(box && box.getAttribute("aria-busy") === "true"),
          pending: !!(box && /\bpending\b/.test(String(box.className || ""))),
          says: !!(say && say.getAttribute("aria-live") === "polite" && say.getAttribute("role") === "status") };
        pendBoxP(id, false);
        await new Promise(r => setTimeout(r, 60));
        row.cleared = !document.getElementById(boxId).hasAttribute("aria-busy");
        row.unpended = !/\bpending\b/.test(String(document.getElementById(boxId).className || ""));
        out[id] = row;
      }
      /* and the panel's balance, on the same contract as the app's */
      const hadKey = state.rhKey;
      state.rhKey = "";
      out.noKey = balAfterSpend();
      state.rhKey = "probe-key";
      out.scheduled = balAfterSpend();
      state.rhKey = hadKey;
      return out;
    });

    ["vuSpin", "vtSpin", "tkSpin"].forEach((id, i) => {
      const r = w[id];
      report("C" + (i + 1) + ") the panel's " + ({ vuSpin: "Video Upscale", vtSpin: "Video Tools", tkSpin: "Talking Photo" })[id] +
        " result card goes busy and pending while the job runs, its status line is the live region, and both clear afterwards",
        !!(r && r.opened && r.box && r.busy && r.pending && r.says && r.cleared && r.unpended), r);
    });
    report("C4) the panel schedules the balance read the same way — refused with no key, scheduled with one",
      w.noKey === false && w.scheduled === true, { noKey: w.noKey, scheduled: w.scheduled });
    report("C5) no page error in the panel while all of that ran", errs.length === 0, errs);
  } finally {
    await page.close().catch(() => { });
    server.close();
  }
}

/* ===================== D) the release ===================== */
function releasePins() {
  const man = JSON.parse(read("panel/manifest.json"));
  const rel = JSON.parse(read("panel/release-manifest.json"));
  const ver = JSON.parse(read("docs/app/version.json"));
  const appVer = (APP.match(/APP_VER\s*=\s*"([\d.]+)"/) || [])[1];
  report("D1) " + VER + " / panel " + PVER + " in lockstep — the web app, version.json, the service worker's cache name, the panel manifest and the release manifest",
    appVer === VER && ver.v === VER &&
    has(read("docs/app/sw.js"), 'var CACHE = "hnk-web-studio-v' + VER.replace(/\./g, "-") + '"') &&
    String(man.version) === PVER && String(rel.version) === PVER,
    { appVer, ver: ver.v, panel: man.version, rel: rel.version });

  const wn = JSON.parse(read("docs/app/data/whatsnew.js").replace(/^window\.HNK_WHATS_NEW=/, "").replace(/;\s*$/, ""));
  const row = wn[0];
  report("D2) the What's New strip leads with this release, in all nine languages, with a bold-led excerpt, and the panel's lifted table carries it",
    !!row && row.v === VER && LANGS.every(l => row.t[l] && row.s[l] && !row.t[l].startsWith("**") && row.s[l].startsWith("**")) &&
    has(PWN, '"v":"' + VER + '"'), row && { v: row.v, kind: row.kind, ref: row.ref });

  report("D3) CI runs this test right after the V2 layer check, and the suite counts 271 invocations",
    has(CI, "run: PORT=8931 node test/verify_gen_loading_billing.js") &&
    CI.indexOf("verify_panel_v2_layer.js") < CI.indexOf("verify_gen_loading_billing.js") &&
    (CI.match(/node test\//g) || []).length === 272 && has(LANDING, "272 tests"),
    { steps: (CI.match(/node test\//g) || []).length });
}

(async () => {
  sourcePins();
  const browser = await chromium.launch();
  try {
    await appWalk(browser);
    await panelWalk(browser);
  } finally { await browser.close(); }
  releasePins();
  console.log("\nverify_gen_loading_billing: " + (failures ? failures + " failed" : "all checks passed"));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — the run itself threw :: " + (e && e.message)); process.exit(1); });
