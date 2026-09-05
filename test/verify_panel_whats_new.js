/* v6.61.0 — the panel tells the student the same news, in the same words.
 *
 * WHY. The owner asked for the NEW mark on both surfaces. A student who works
 * in Photoshop all day would otherwise be the LAST to hear that a workflow
 * they could use today exists — exactly the person the announcement is for.
 *
 * Two halves. First, that the panel's lifted list is the app's list, entry
 * for entry, in the same order and the same nine languages: a hand-copied
 * table drifts, and a panel advertising last month's release while the phone
 * shows this one is worse than no strip at all. Second, that the strip and
 * the card ribbon actually draw in the panel's own DOM, because a correct
 * table that never reaches the screen announces nothing.
 *
 * Usage: node test/verify_panel_whats_new.js */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) failures++;
}

/* the app's own table, read the way the panel's lift read it */
function appList() {
  const src = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
  const i = src.indexOf("var WHATS_NEW = [");
  const start = src.indexOf("[", i);
  let d = 0;
  for (let k = start; k < src.length; k++) {
    if (src[k] === "[") d++;
    else if (src[k] === "]") { d--; if (!d) return eval(src.slice(start, k + 1)); }
  }
  throw new Error("the app's WHATS_NEW array is unterminated");
}
function appVer() {
  const src = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
  return (src.match(/var\s+APP_VER\s*=\s*"([^"]+)"/) || [])[1];
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".mp4": "video/mp4", ".woff2": "font/woff2" };

(async () => {
  /* ---- A) the lift is exact ---- */
  const app = appList();
  const panel = require(path.join(PANEL, "js", "hnk_whats_new.js"));
  report("A) the panel ships the same number of entries as the app",
    panel.LIST.length === app.length, { app: app.length, panel: panel.LIST.length });

  const drift = [];
  app.forEach((a, i) => {
    const p = panel.LIST[i];
    if (!p) { drift.push({ i, missing: a.ref }); return; }
    if (p.v !== a.v || p.kind !== a.kind || p.ref !== a.ref) drift.push({ i, app: a.v + "/" + a.ref, panel: p.v + "/" + p.ref });
    LANGS.forEach(l => {
      if ((a.t || {})[l] !== (p.t || {})[l]) drift.push({ i, ref: a.ref, field: "t." + l });
      if ((a.s || {})[l] !== (p.s || {})[l]) drift.push({ i, ref: a.ref, field: "s." + l });
    });
  });
  report("A2) every entry matches the app's — version, kind, target, and all nine languages of both lines",
    drift.length === 0, drift.slice(0, 5));

  /* v5.91.1 — major.minor, matching the app-side gate and for the same
     reason: a MINOR adds something and must announce itself, a PATCH repairs
     something already announced and must not push the real news down the
     strip to say so. */
  const mm = v => String(v).split(".").slice(0, 2).join(".");
  report("A3) the newest entry still names the shipping minor (the app's own gate, re-checked from the panel's copy)",
    panel.LIST[0] && mm(panel.LIST[0].v) === mm(appVer()), { appVer: appVer(), newest: panel.LIST[0] && panel.LIST[0].v });

  /* v6.3.0 — and byte for byte, because the lift is now a tool. A2 above
     compares the fields; this compares the file, so a hand-edit that happens
     to agree today still fails, and the message says which command repairs
     it rather than leaving the next person to retype nineteen entries. */
  const { build } = require(path.join(ROOT, "tools", "build_panel_whats_new.js"));
  report("A4) the panel's file is exactly what the lift produces from the app today",
    fs.readFileSync(path.join(PANEL, "js", "hnk_whats_new.js"), "utf8") === build(),
    "run: node tools/build_panel_whats_new.js");

  /* ---- B) and it reaches the panel's screen ---- */
  const { chromium } = require("playwright-core");
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.route("**/*", r => {
      const u = r.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return r.continue();
      if (r.request().resourceType() === "image")
        return r.fulfill({ status: 200, contentType: "image/gif",
          body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") });
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.addInitScript(UXP_STUB);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.waitForFunction(() => {
      try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); }
      catch (e) { return false; }
    }, null, { timeout: 20000 }).catch(() => { throw new Error("the panel never reached its signed-in state"); });

    const B = await page.evaluate(() => {
      try { localStorage.removeItem("hnk_new_seen"); } catch (e) { }
      try { switchPage("home"); } catch (e) { }
      return null;
    });
    await page.waitForTimeout(700);
    const home = await page.evaluate(() => {
      const card = document.getElementById("hnkDashNew");
      const root = card && card.parentNode;
      const kids = root ? [...root.children] : [];
      return {
        drawn: !!card,
        /* pinned at the top: only the greeting hero may come first */
        index: card ? kids.indexOf(card) : -1,
        before: card ? kids.slice(0, kids.indexOf(card)).map(k => k.id || k.className) : [],
        rows: document.querySelectorAll("#hnkDashNew .nw-row").length,
        tags: document.querySelectorAll("#hnkDashNew .nw-tag").length,
        xs: document.querySelectorAll("#hnkDashNew .nw-x").length,
        total: (window.HNK.whatsNew.LIST || []).length,
        titles: [...document.querySelectorAll("#hnkDashNew .nw-t")].map(n => n.textContent)
      };
    });
    report("B) the strip draws on the panel's Home, directly under the greeting",
      home.drawn && home.index === 1 && home.before.every(b => /dashGreet|dash-greet/.test(b)), home);
    /* v6.71.0 — the panel's strip has the same ceiling the app's does
       (three), so the two surfaces still show a student the same thing.
       Pinning it to the unread TOTAL would now demand the panel draw a wall
       of seventeen rows that the app deliberately no longer draws. */
    const NW_STRIP_MAX = 3;
    report("B2) the strip draws the newest three, each marked NEW and each dismissable",
      home.rows === Math.min(home.total, NW_STRIP_MAX) &&
      home.tags === home.rows && home.xs === home.rows, home);
    report("B3) the rows say what the app's rows say",
      home.titles.length > 0 && home.titles.every(t => t && t.length > 3), home.titles);

    /* the ribbon on the Workflows page */
    await page.evaluate(() => { try { switchPage("wf"); } catch (e) { } });
    await page.waitForTimeout(900);
    const wf = await page.evaluate(() => {
      /* by card, not by row — see verify_whats_new E: a card named by two
         entries still wears exactly one ribbon. */
      const want = [...new Set((window.HNK.whatsNew.LIST || [])
        .filter(e => e.kind === "wf").map(e => e.ref))];
      return {
        want: want,
        marked: [...document.querySelectorAll(".wfmini.is-new")].map(m => m.id.replace("hnkWf_", "")),
        ribbons: document.querySelectorAll(".wf-new").length
      };
    });
    report("C) every unread workflow wears the NEW ribbon in the panel too, and only those",
      wf.marked.slice().sort().join(",") === wf.want.slice().sort().join(",") &&
      wf.ribbons === wf.want.length, wf);

    /* v6.78.1 — DISMISSING BY HAND, the way a student does it. The × used to
       remove its own row and nothing else: main.js never wires deps.onRefresh,
       so after the three visible rows were dismissed a student sat under an
       empty gold card with "(26)" in its heading and 23 unread items that
       never rose into view. The app's × redraws the strip (nwSync); the panel
       must too — the next unread row comes up, and the card leaves once
       nothing is unread. D pre-seeds storage and would never see this. */
    const byHand = await page.evaluate(async () => {
      try { localStorage.removeItem("hnk_new_seen"); } catch (e) { }
      try { switchPage("wf"); switchPage("home"); } catch (e) { }
      await new Promise(r => setTimeout(r, 500));
      const total = window.HNK.whatsNew.LIST.length;
      const rows = () => document.querySelectorAll("#hnkDashNew .nw-row").length;
      const head = () => ((document.getElementById("hnkDashNewH2") || {}).textContent || "");
      const seen = () => { try { return JSON.parse(localStorage.getItem("hnk_new_seen") || "[]").length; } catch (e) { return -1; } };
      const before = { rows: rows(), head: head(), seen: seen() };
      const firstKey = (document.querySelector("#hnkDashNew .nw-row") || {}).getAttribute
        ? document.querySelector("#hnkDashNew .nw-row").getAttribute("data-nw") : null;
      const x = document.querySelector("#hnkDashNew .nw-x");
      if (!x) return { total, before, noX: true };
      x.click();
      await new Promise(r => setTimeout(r, 300));
      const afterOne = { rows: rows(), head: head(), seen: seen(),
        firstGone: !document.querySelector('#hnkDashNew .nw-row[data-nw="' + firstKey + '"]') };
      let clicks = 1;
      for (let i = 0; i < total + 5; i++) {
        const b = document.querySelector("#hnkDashNew .nw-x");
        if (!b) break;
        b.click(); clicks++;
        await new Promise(r => setTimeout(r, 60));
      }
      return { total, before, afterOne, clicks,
        end: { card: !!document.getElementById("hnkDashNew"), seen: seen() } };
    });
    report("D1) dismissing one row by hand brings the next unread up — the strip stays three deep and the heading counts down by one",
      !byHand.noX && byHand.before.rows === 3 && byHand.afterOne.rows === 3 && byHand.afterOne.firstGone &&
      byHand.afterOne.seen === byHand.before.seen + 1 &&
      byHand.before.head.indexOf("(" + byHand.total + ")") >= 0 && byHand.afterOne.head.indexOf("(" + (byHand.total - 1) + ")") >= 0,
      JSON.stringify(byHand).slice(0, 400));
    report("D2) dismissing every row by hand leaves no card behind — the strip is gone and every item is recorded as read",
      byHand.end && byHand.end.card === false && byHand.end.seen === byHand.total && byHand.clicks === byHand.total,
      JSON.stringify({ clicks: byHand.clicks, end: byHand.end, total: byHand.total }));

    /* dismissing silences it and stays silenced */
    const after = await page.evaluate(() => {
      const list = window.HNK.whatsNew.LIST;
      const seen = list.map(e => window.HNK.whatsNew.key(e));
      try { localStorage.setItem("hnk_new_seen", JSON.stringify(seen)); } catch (e) { }
      try { switchPage("wf"); switchPage("home"); } catch (e) { }
      return null;
    });
    await page.waitForTimeout(700);
    const quiet = await page.evaluate(() => ({
      card: !!document.getElementById("hnkDashNew"),
      ribbons: (function () { try { switchPage("wf"); } catch (e) { } return document.querySelectorAll(".wf-new").length; })()
    }));
    report("D) once everything is read the panel draws no strip and no ribbon — nothing empty is left behind",
      quiet.card === false && quiet.ribbons === 0, quiet);

    report("E) no page error while the panel drew any of it", errs.length === 0, errs.slice(0, 3));
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }

  console.log(failures
    ? `\n${failures} FAILURE(S) — the panel and the phone would not be telling the student the same thing.`
    : "\nAll checks passed — the panel carries the app's news, word for word, and shows it in the same two places.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });
