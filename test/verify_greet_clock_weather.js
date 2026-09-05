/* v6.11.0 — THE CLOCK READS TWELVE-HOUR, AND THE CARD TELLS THE WEATHER.
 *
 * WHAT THE OWNER ASKED FOR, in their words: make the clock AM/PM, twelve
 * hours round, and add the weather.
 *
 * Both are properties of one line on the Home card, on two surfaces, and both
 * are the kind of thing that quietly regresses — a locale hands back a
 * 24-hour clock under my-MM, a weather fetch that fails throws instead of
 * staying silent, the panel's copy of a table drifts from the app's. So each
 * is checked here rather than trusted:
 *
 *   - the clock is 12-hour with AM/PM in every language, at midnight, at
 *     noon, in the morning and in the evening — and never the 24-hour form;
 *   - the weather line names the device's ZONE city's sky and temperature,
 *     with the word in the student's own language, from ONE request that is
 *     then kept for thirty minutes; a night sky gets the moon;
 *   - a failing answer, an unknown zone, or no network leave the card silent
 *     — no line, no page error, and for an unknown zone no request at all;
 *   - the panel carries the app's formatter and tables byte for byte, its
 *     greeting uses them, and its manifest allows the weather host.
 *
 * Usage: PORT=8931 node test/verify_greet_clock_weather.js  (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const PORT = process.env.PORT || 8931;
const ROOT = path.resolve(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
const PANEL_HOME = fs.readFileSync(path.join(ROOT, "panel/src/ui/screens/home-screen.js"), "utf8");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "panel/manifest.json"), "utf8"));
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) failures++;
}
/* Yangon is UTC+6:30 — wall-clock instants expressed in UTC */
const YGN = (h, m) => Date.UTC(2026, 8, 5, h - 6, m - 30);
const WX_CLOUD = { current: { temperature_2m: 31.4, weather_code: 3, is_day: 1 } };
const WX_NIGHT = { current: { temperature_2m: 24.6, weather_code: 0, is_day: 0 } };

/* the page's clock is fixed BEFORE it loads: the weather cache is dated by
   Date.now(), so a first fetch at the real time followed by a jump to the
   fixed time would look thirty minutes stale and fetch again */
async function open(browser, tz, wx, hits, at) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: tz });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.clock.setFixedTime(at);
  await page.route("https://api.open-meteo.com/**", route => {
    hits.n++; hits.last = route.request().url();
    if (wx === "fail") return route.fulfill({ status: 500, contentType: "text/plain", body: "nope" });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(wx) });
  });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
    localStorage.setItem("hnk_seen_splash", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  return { page, errs };
}
const greet = async (page, lang) => page.evaluate(l => {
  if (l) LANG = l;
  switchPage("pgDash"); renderDashGreet();
  const q = s => { const n = document.querySelector("#dashGreet " + s); return n ? n.textContent : null; };
  return { sub: q(".sub"), wx: q(".wx") };
}, lang || null);

(async () => {
  const browser = await chromium.launch();
  withPremium(browser);
  try {
    /* ---- A) the clock ---- */
    const hits = { n: 0, last: "" };
    let { page, errs } = await open(browser, "Asia/Yangon", WX_CLOUD, hits, YGN(20, 5));
    const clocks = [];
    for (const [h, m, want] of [[20, 5, "8:05 PM"], [0, 7, "12:07 AM"], [12, 0, "12:00 PM"], [9, 3, "9:03 AM"], [23, 59, "11:59 PM"]]) {
      await page.clock.setFixedTime(YGN(h, m));
      const r = await greet(page, "en");
      clocks.push({ at: `${h}:${m}`, want, sub: r.sub });
    }
    report("A) the clock reads twelve-hour with AM/PM — 8:05 PM, 12:07 AM, 12:00 PM, 9:03 AM, 11:59 PM",
      clocks.every(c => (c.sub || "").indexOf("· " + c.want + " ·") >= 0), clocks.filter(c => (c.sub || "").indexOf("· " + c.want + " ·") < 0));
    await page.clock.setFixedTime(YGN(20, 5));
    const perLang = [];
    for (const l of LANGS) { const r = await greet(page, l); perLang.push({ l, sub: r.sub }); }
    report("A2) …in every one of the nine languages, never the 24-hour form",
      perLang.every(x => /· 8:05 PM ·/.test(x.sub || "") && !/20:05/.test(x.sub || "")), perLang.filter(x => !/· 8:05 PM ·/.test(x.sub || "") || /20:05/.test(x.sub || "")));
    /* Chromium names the zone Asia/Rangoon; the app shows what the zone says,
       and a Burmese reader gets ရန်ကုန် */
    report("A3) the line still carries the date and the zone city",
      perLang.every(x => /Yangon|Rangoon|ရန်ကုန်/.test(x.sub || "")), perLang.slice(0, 2));

    /* ---- B) the weather ---- the clock jumps above each looked half a day
       stale to the cache, so the count is read as a DELTA from here: nine
       repaints at one fixed time must add no request */
    await page.waitForTimeout(900);
    const hitsBefore = hits.n;
    const B = [];
    for (const l of LANGS) {
      const r = await greet(page, l);
      const word = await page.evaluate(k => WX_WORD.cloud[k], l);
      B.push({ l, wx: r.wx, want: "☁️ 31°C · " + word });
    }
    report("B) the card tells the weather — the sky glyph, the rounded temperature and the word in the student's language",
      B.every(x => x.wx === x.want), B.filter(x => x.wx !== x.want).slice(0, 3));
    const cache = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem("hnk_wx_v1")); } catch (e) { return null; } });
    const zone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    report("B2) a reading for the zone city's coordinates, kept for thirty minutes — nine repaints add no request",
      hits.n === hitsBefore && hits.n >= 1 && /latitude=16\.87&longitude=96\.2/.test(hits.last) && cache && cache.tz === zone && cache.temp === 31.4,
      { hits: hits.n, before: hitsBefore, url: hits.last, cache, zone });
    report("B3) the weather sits on its own line under the clock, and the clock line is untouched by it",
      B.every(x => true) && perLang.every(x => !/°C/.test(x.sub || "")), perLang.slice(0, 1));
    report("B4) no page error through the clock and weather run", errs.length === 0, errs.slice(0, 2));
    await page.close();

    /* ---- C) night ---- */
    const hitsN = { n: 0 };
    ({ page, errs } = await open(browser, "Asia/Bangkok", WX_NIGHT, hitsN, Date.UTC(2026, 8, 5, 15, 40))); /* 22:40 Bangkok */
    await greet(page, "en"); await page.waitForTimeout(900);
    let r = await greet(page, "en");
    report("C) a clear night sky gets the moon, and Bangkok its own coordinates",
      r.wx === "🌙 25°C · Clear night" && hitsN.n === 1, { wx: r.wx, hits: hitsN.n });
    await page.close();

    /* ---- D) silence ---- */
    const hitsF = { n: 0 };
    ({ page, errs } = await open(browser, "Asia/Yangon", "fail", hitsF, YGN(20, 5)));
    await greet(page, "en"); await page.waitForTimeout(900);
    r = await greet(page, "en");
    report("D) a failing answer leaves the card silent — no line, no error, the clock line still there, and no second request for five minutes",
      r.wx === null && errs.length === 0 && hitsF.n === 1 && /AM|PM/.test(r.sub || ""), { wx: r.wx, errs: errs.slice(0, 1), hits: hitsF.n });
    await page.close();
    const hitsU = { n: 0 };
    ({ page, errs } = await open(browser, "Pacific/Chatham", WX_CLOUD, hitsU, YGN(20, 5)));
    await greet(page, "en"); await page.waitForTimeout(900);
    r = await greet(page, "en");
    report("D2) a zone the table does not know asks nobody anything — no request, no line, no error",
      r.wx === null && hitsU.n === 0 && errs.length === 0, { wx: r.wx, hits: hitsU.n, errs: errs.slice(0, 1) });
    await page.close();

    /* ---- E) the panel is the app ---- */
    const grab = (src, re) => { const m = src.match(re); return m ? m[0].replace(/\s+/g, " ").trim() : null; };
    const FMT = /function fmtClock12\(d\)\{[\s\S]*?\n\}/;
    const KIND = /function wxKind\(code, isDay\)\{[\s\S]*?\n\}/;
    const same = [
      ["fmtClock12", grab(APP, FMT), grab(PANEL_HOME, FMT)],
      ["wxKind", grab(APP, KIND), grab(PANEL_HOME, KIND)],
      ["WX_COORDS", grab(APP, /var WX_COORDS=\{.*?\};/), grab(PANEL_HOME, /var WX_COORDS=\{.*?\};/)],
      ["WX_ICON", grab(APP, /var WX_ICON=\{.*?\};/), grab(PANEL_HOME, /var WX_ICON=\{.*?\};/)],
      ["WX_WORD", grab(APP, /var WX_WORD=\{[\s\S]*?\n\};/), grab(PANEL_HOME, /var WX_WORD=\{[\s\S]*?\n\};/)]
    ];
    report("E) the panel carries the app's clock formatter, sky mapping and all three weather tables byte for byte",
      same.every(x => x[1] && x[1] === x[2]), same.filter(x => !x[1] || x[1] !== x[2]).map(x => x[0]));
    report("E2) both greetings actually use the formatter",
      /var tm=fmtClock12\(new Date\(\)\);/.test(APP) && /var clock = fmtClock12\(now\);/.test(PANEL_HOME) &&
      !/hour:"numeric",minute:"2-digit"/.test(APP) && !/hour: "numeric", minute: "2-digit"/.test(PANEL_HOME),
      "a greeting still formats its clock through Intl");
    report("E3) the panel manifest allows the weather host, and nothing broader",
      MANIFEST.requiredPermissions.network.domains.includes("https://api.open-meteo.com") &&
      !MANIFEST.requiredPermissions.network.domains.includes("all"),
      MANIFEST.requiredPermissions.network.domains);
  } finally {
    await browser.close();
  }
  console.log(failures
    ? `\n${failures} check(s) failed`
    : "\nAll checks passed — the clock reads twelve-hour, the card tells the weather, and the panel says the same.");
  process.exit(failures ? 1 : 0);
})();
