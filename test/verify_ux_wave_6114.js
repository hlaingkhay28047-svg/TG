/* verify_ux_wave_6114.js — 6.114.0 / panel 6.185.0
   UI/UX WAVE A — REACH · READ · FOCUS. The measurable floor under every page of the
   web app and of the Photoshop panel, on the smallest screens each is used on.

   The owner asked (2026-09-20) for the whole UI/UX to be upgraded "on every phone,
   every tablet, every computer … the CCX too … every page … in detail". The audit
   that opened the programme measured all nineteen app pages at 390 / 820 / 1440 and
   all eighteen panel pages at 360 / 420 / 640, and the first wave is the part of
   that audit a number can prove:

     1. REACH. 217 of the app's 917 phone controls and 161 of the panel's 793 were
        under 40px in one dimension — chips at 34–38px, the Setup readiness rows at
        26px, the studio reset discs at 34/28px, the Album colour dots at 22px, the
        card "Open" buttons at 32–37px, the What's New ✕ at 36px. Every control is
        now at least 40 × 40 on both surfaces. Where a visual was owner-approved at
        its size (the 34px studio disc, the 22px colour dot) the ELEMENT grew and the
        visual did not: negative margins keep the layout box, a transparent border
        carries the hit area, and the colour is clipped to the padding box.
     2. READ. 677 of the app's phone text nodes and 773 of the panel's were under
        12px, many at 8–10px (.hsl-ctx 8px, .nw-tag 9.5px, .ph-kick 10px, .tabb 10.5px).
        Every --fs-* token moves one step (Normal 13 → 14px for body copy; Small and
        Large keep their distance) and nothing is set under 11px any more, except the
        header's wordmark label (a brand mark, not a line to read) and, under 340px only,
        the Workflows hero kicker, which must stay one line in a 286px plate (10px there).
     3. FOCUS. The app had a global gold :focus-visible ring but .im-card and .im-tpl
        killed it with outline:none; the panel had outline:none on .pbox:focus,
        .hnk-input:focus and the same two cards, and a ring on seven classes only.
        No :focus rule on either surface may set outline:none, and the panel's shared
        ring covers every button, input, [tabindex], chip, sub-tab, tab and card.
     4. HERO. Gold and cream headings sat on a scrim of 0 → .04 → .72; on the bright
        plates (Imagine, Retouch B, Retouch, Path) the band behind the heading read
        at L .19–.22 (3.4–3.8 : 1 against cream). The scrim is .06 → .16 → .6 → .88 and
        the band behind every heading now reads at L ≤ .15 (≥ 4.5 : 1). Measured from
        pixels, not from the stylesheet.
     5. RAILS. Sub-tab rails snap chip by chip (scroll-snap-type x proximity) and
        their edge fades are 40px wide and hold the ink to 35% before fading, on both
        surfaces, so a pill cut at an edge reads as "more this way".
     6. BANNER + ALTS. Off Home the API-key banner is one ellipsised line (it was a
        three-line block on all nineteen pages); the wall still hides it. Every icon
        <img> the panel builds carries alt="" — 204 had none on the Studio pages.

   BEFORE THE FIX, measured by the audit this test grew out of (the same ruler):
   B2 217 small controls, B3 hundreds under 11px (.hsl-ctx 8px, .nw-tag 9.5px,
   .ph-kick 10px, .tabb 10.5px), B8 six heroes over L .15 (Imagine .217), C2 161
   small panel controls, C4 204 icon pictures without alt, and outline:none on two
   app and four panel :focus rules (A3 / B5 / C5). The old scrim re-injected fails B8
   on those six pages; the alt taken back out of iconTag fails A8 and C4. */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const { FAKE_FS_SRC } = require("./lib/fake-fs.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const PORT = process.env.PORT || 8931;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("docs/app/index.html");
const PCSS = read("panel/styles.css");
const PMAIN = read("panel/main.js");
const RSS = read("panel/src/ui/screens/retouch-studio-screen.js");
const LIFTER = read("tools/build_panel_studio_suites.js");
const PSS = read("panel/js/hnk_studio_suites.js");
const SW = read("docs/app/sw.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const APP_PAGES = ["pgHome", "pgDash", "pgCreate", "pgWf", "pgImagine", "pgMeitu", "pgEvoto", "pgRetouch", "pgPath", "pgVideo", "pgVideoUp", "pgV2V", "pgTalk", "pgText2Img", "pgLib", "pgGallery", "pgAlbum", "pgAccount", "pgTutorials"];
const PANEL_KEYS = ["aitools", "wf", "create", "prompt", "imagine", "meitu", "evoto", "retouch", "path", "video", "vidup", "v2v", "talk", "presets", "gallery", "setup", "album", "tutorials"];
const HERO_BAND_MAX = 0.15;   /* relative luminance behind the heading: ≤ .15 is ≥ 4.5 : 1 against the cream text */

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 900)));
  if (!ok) failures++;
}
const has = (s, t) => s.indexOf(t) >= 0;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

/* ================= the ruler (runs in the page, both surfaces) ================= */
function measure() {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0"; };
  const inPage = (el) => !el.closest(".page:not(.on), [hidden], dialog:not([open])");
  const desc = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : "");
  const targets = Array.from(document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [tabindex]:not([tabindex='-1'])")).filter((el) => vis(el) && inPage(el));
  const small = [];
  for (const el of targets) {
    const r = el.getBoundingClientRect();
    if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue;   /* a link inside a sentence: WCAG 2.5.8 inline exception */
    if (r.width < 40 || r.height < 40) small.push(desc(el) + " " + Math.round(r.width) + "x" + Math.round(r.height));
  }
  /* the one-line ruler. CI's runner has no Myanmar face: a Burmese label that wraps to two
     lines on this machine fits one line there, and its fallback face (DejaVu / Liberation)
     draws a tighter line box than Noto Sans Myanmar — so a control that reaches 40px only
     because its label wrapped, or because the face here is tall, is under 40px on that
     runner, on an English phone, and in the shortest of the nine languages (run 35486844206:
     the Gallery search box at 38, the watermark strip's chips at 32; both 40+ here from the
     text alone). Force every label onto one line at the tightest "normal" line box a device
     may land on (1.15 — Arial / Liberation Sans is 1.149) and measure the same controls
     again: the floor has to hold with no help from the text. */
  const oneLine = document.createElement("style"); oneLine.id = "hnkOneLineRuler";
  oneLine.textContent = ".hnk-oneline :is(button,a[href],input,select,textarea,[role=button],[role=tab],[tabindex]:not([tabindex='-1']),.chip){white-space:nowrap!important;line-height:1.15!important}";
  document.head.appendChild(oneLine); document.documentElement.classList.add("hnk-oneline");
  const smallOneLine = [];
  for (const el of targets) {
    if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue;
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.height < 40) smallOneLine.push(desc(el) + " " + Math.round(r.width) + "x" + Math.round(r.height));
  }
  document.documentElement.classList.remove("hnk-oneline"); oneLine.remove();
  const textEls = Array.from(document.querySelectorAll("body *")).filter((el) => vis(el) && inPage(el) && Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 1));
  const tiny = [];
  for (const el of textEls) {
    if (el.closest("svg")) continue;                                  /* a label drawn inside a picture */
    if (el.classList.contains("hnk-studio-label")) continue;          /* the wordmark's brand label, not a line to read */
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 11) tiny.push(desc(el) + " " + fs.toFixed(1) + "px");
  }
  const imgNoAlt = Array.from(document.images).filter((i) => vis(i) && inPage(i) && !i.hasAttribute("alt")).map((i) => desc(i) + " " + String(i.getAttribute("src") || "").slice(0, 40));
  let focusOutlineNone = 0, focusVisibleRules = 0;
  for (const ss of Array.from(document.styleSheets)) { try { for (const r of Array.from(ss.cssRules)) { const t = r.selectorText || ""; if (t.indexOf(":focus-visible") >= 0) focusVisibleRules++; if (t.indexOf(":focus") >= 0 && /outline\s*:\s*(none|0)(\s|;|})/.test(r.cssText)) focusOutlineNone++; } } catch (e) { } }
  return { overflowX: Math.max(0, document.documentElement.scrollWidth - innerWidth), targets: targets.length, small, smallOneLine, textEls: textEls.length, tiny, imgNoAlt, focusOutlineNone, focusVisibleRules };
}

/* the band behind the active page's hero heading, read from pixels */
async function heroBand(page) {
  const geo = await page.evaluate(async () => {
    const pg = document.querySelector(".page.on"); const hero = pg && pg.querySelector(".page-hero"); if (!hero) return null;
    const img = hero.querySelector("img");
    for (let i = 0; i < 50 && img && !(img.complete && img.naturalWidth > 0); i++) await new Promise((r) => setTimeout(r, 100));
    window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 120));
    const h = hero.getBoundingClientRect(), t = (hero.querySelector(".ph-head") || hero).getBoundingClientRect();
    return { clip: { x: h.left, y: h.top, width: h.width, height: h.height }, head: { y: t.top - h.top, h: t.height }, loaded: !!(img && img.complete && img.naturalWidth > 0) };
  });
  if (!geo) return null;
  const png = await page.screenshot({ clip: geo.clip });
  const L = await page.evaluate(async ([b64, head]) => {
    const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode();
    const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height; const g = cv.getContext("2d"); g.drawImage(im, 0, 0);
    const y0 = Math.max(0, Math.floor(head.y - 6)), y1 = Math.min(im.height, Math.ceil(head.y + head.h + 6));
    const d = g.getImageData(0, y0, im.width, y1 - y0).data; let L = 0, n = 0;
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    for (let i = 0; i < d.length; i += 4) { L += 0.2126 * f(d[i]) + 0.7152 * f(d[i + 1]) + 0.0722 * f(d[i + 2]); n++; }
    return L / n;
  }, [png.toString("base64"), geo.head]);
  return { L: +L.toFixed(3), loaded: geo.loaded };
}

/* ================= A) the source ================= */
function sourcePins() {
  report("A1) type tokens one step up on every tier — Normal 11/12/13/14/15, Small 10/11/12/13/14, Large 12/13/14/15/16.5; body sizes untouched (15 / 13.5 / 17)",
    has(APP, "--fs-2xs:11px; --fs-xs:12px; --fs-sm:13px; --fs-base:14px; --fs-md:15px;") &&
    has(APP, "html.tsize-l{--fs-2xs:12px;--fs-xs:13px;--fs-sm:14px;--fs-base:15px;--fs-md:16.5px}\nhtml.tsize-l body{font-size:17px}") &&
    has(APP, "html.tsize-s{--fs-2xs:10px;--fs-xs:11px;--fs-sm:12px;--fs-base:13px;--fs-md:14px}\nhtml.tsize-s body{font-size:13.5px}"), null);

  report("A2) the 40px reach floor in the app's stylesheet: .chip, the card Open button, .inp (the Gallery search box included — its own rule said 38), button.acc-kv, #stSearch, .nw-x, .slotchip, the studio group chips, suite chips, the segmented strips (32 → 40 on both surfaces) and the two Home stat links (a firm 40, not the line box's gift); the 34px studio disc and the 22px Album dot grow as ELEMENTS only (negative margins keep the layout box, the dot's hit area is a transparent border with the colour clipped to the padding box)",
    /\.chip\{[^}]*min-height:40px;box-sizing:border-box;display:inline-flex;align-items:center\}/.test(APP) &&
    has(APP, ".im-card-foot .im-open{min-height:40px;padding:5px 12px;margin:3px;flex:1 1 auto;font-size:12px}") &&
    has(APP, ".inp{width:100%;min-height:40px;") &&
    has(APP, "button.acc-kv{min-height:40px;align-items:center;padding:2px 0;border-radius:8px}") &&
    has(APP, "#stSearch{flex:1;min-width:80px;min-height:40px;") &&
    has(APP, ".nw-x{flex:0 0 auto;min-width:40px;min-height:40px;") &&
    has(APP, ".slotchip{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;min-height:40px;") &&
    has(APP, "#stGroupChips .chip{flex:0 0 auto;white-space:nowrap;min-height:40px;") &&
    has(APP, "#stMuCard .chip,#stEvCard .chip{min-height:40px;") &&
    has(APP, ".gal-tools .inp{min-height:40px;font-size:var(--fs-sm)}") &&
    has(APP, ".dash-stat-link{cursor:pointer;border-radius:var(--r-md);transition:background .2s;min-height:40px;box-sizing:border-box}") &&
    has(PCSS, "#pageAiTools .dash-stat .dash-stat-link { cursor: pointer; border-radius: 12px; min-height: 40px; box-sizing: border-box; }") &&
    has(APP, "#stMuCard .chips.seg .chip,#stEvCard .chips.seg .chip{flex:1;justify-content:center;border:0;background:transparent;\n  border-radius:6px;box-shadow:none;min-height:40px;padding:5px 8px}") &&
    has(PCSS, ".stpg .chips.seg .chip {\n  flex: 1 1 0; justify-content: center; border: 0; background-color: transparent;\n  border-radius: 6px; min-height: 40px; padding: 5px 8px; margin: 0;\n}") &&
    has(APP, ".st-sact{order:4;display:inline-flex;gap:6px;flex:0 0 auto}") && has(APP, ".st-sact .sa{width:40px;height:40px;margin:-3px;border-radius:8px;") &&
    has(APP, ".alb-ink{width:40px;height:40px;padding:0;margin:-9px -6px -9px -9px;border-radius:50%;border:9px solid transparent;background-clip:padding-box !important;box-shadow:inset 0 0 0 1px var(--line-soft);cursor:pointer}") &&
    has(APP, ".alb-ink:last-child{margin-right:-9px}") && has(APP, ".alb-ink.on{box-shadow:inset 0 0 0 2px var(--gold)}"), null);

  const appCss = APP.slice(0, APP.indexOf("</style>", APP.indexOf("<style")) + 8);
  const killers = (css) => (css.match(/[^{}]*:focus[^{}]*\{[^}]*outline\s*:\s*(none|0)\s*[;}]/g) || []).map((m) => m.slice(0, 80));
  report("A3) FOCUS — no :focus rule on either surface sets outline:none any more; the two cards that swallowed the app's ring get their own gold ring; the panel's shared ring covers button, input, textarea, select, [tabindex], .chip, .subtab, .tabb, .sa, .pbox, .hnk-input, .im-card and .im-tpl at 2px offset",
    killers(appCss).length === 0 && killers(PCSS).length === 0 &&
    has(APP, ".im-card:focus-visible{outline:2px solid var(--gold);outline-offset:2px}") &&
    has(APP, ".im-tpl:focus-visible{outline:2px solid var(--gold-hi);outline-offset:2px}") &&
    has(APP, ":where(button,a,select,input,textarea,[tabindex]):focus-visible{outline:2px solid var(--gold);outline-offset:2px}") &&
    has(PCSS, ".pbox:focus { border-color: var(--accent); }") && has(PCSS, ".hnk-input:focus { border-color: var(--accent); }") &&
    has(PCSS, "button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible,\n[tabindex]:focus-visible, .chip:focus-visible, .subtab:focus-visible, .tabb:focus-visible,\n.sa:focus-visible, .pbox:focus-visible, .hnk-input:focus-visible,\n.im-card:focus-visible, .im-tpl:focus-visible {\n  outline: 2px solid var(--accent);\n  outline-offset: 2px;\n}"),
    { app: killers(appCss), panel: killers(PCSS) });

  report("A4) RAILS — the app's .subtabbar snaps (x proximity, 40px scroll padding), its sticky edge fades are 40px wide and hold the ink to 35%, every .subtab snaps to centre; the panel's real-span fades match (40px, 35%)",
    has(APP, ".subtabbar{display:none;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;margin:var(--sp-3) 0;position:relative;scroll-snap-type:x proximity;scroll-padding:0 40px}") &&
    has(APP, '.subtabbar:before,.subtabbar:after{content:"";position:sticky;flex:0 0 40px;width:40px;') &&
    has(APP, ".subtabbar:before{left:0;margin-right:-46px;background:linear-gradient(to right,var(--ink) 35%,transparent)}") &&
    has(APP, ".subtabbar:after{right:0;margin-left:-46px;background:linear-gradient(to left,var(--ink) 35%,transparent)}") &&
    has(APP, ".subtab{flex:0 0 auto;scroll-snap-align:center;") &&
    has(PCSS, ".subfade { display: none; position: absolute; top: 12px; bottom: 0; width: 40px; z-index: 2; }") &&
    has(PCSS, ".subfade-l { left: 0; background: linear-gradient(to right, var(--bg) 35%, transparent); }") &&
    has(PCSS, ".subfade-r { right: 0; background: linear-gradient(to left, var(--bg) 35%, transparent); }"), null);

  report("A5) HERO — the scrim is .06 → .16 (42%) → .6 (74%) → .88, and the kicker is 11px on both surfaces",
    has(APP, ".page-hero:after{content:\"\";position:absolute;top:0;left:0;right:0;bottom:0;z-index:1;background:linear-gradient(180deg,rgba(11,13,20,.06) 0%,rgba(11,13,20,.16) 42%,rgba(11,13,20,.6) 74%,rgba(11,13,20,.88) 100%)}") &&
    has(APP, ".page-hero .ph-kick{position:relative;z-index:2;max-width:72%;font-size:11px;") &&
    has(PCSS, "  font-size: 11px; font-weight: 800; letter-spacing: .26em;\n  text-transform: uppercase; color: var(--accent-h);"), null);

  report("A6) BANNER — off Home the key banner is one ellipsised line (no display property in that rule, so body.wall .keybanner keeps winning); updateKeyBanner reads curPage and switchPage re-runs it right after curPage changes",
    has(APP, ".keybanner.compact.on{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:6px 12px;margin:8px 0;font-size:var(--fs-xs);line-height:26px}") &&
    !/\.keybanner\.compact\.on\{[^}]*display/.test(APP) &&
    has(APP, 'var b=$("keyBanner"); if(b) b.className="keybanner"+(state.rhKey?"":" on")+((typeof curPage==="string"&&curPage==="pgHome")?"":" compact");') &&
    has(APP, "\n  curPage=id;\n  try{ if(typeof updateKeyBanner===\"function\") updateKeyBanner(); }catch(e){}\n  PAGES.forEach(function(p){\n") &&
    has(APP, "body.wall .keybanner{display:none}"), null);

  report("A7) READ — the 11px floor in the rules the audit named: .tabb 11, .nw-s 12, .nw-tag 11, .hsl-ctx 11, .kick 11, .im-card-sum 12, .im-tplcount 11, .wf-need 11, .im-lb 11, the ref tags 11, .hero-mini .kick .7rem (.69rem under 390); panel .tabb 11, .chip 13/40, .subtab 13, .nw-tag 11, .diag-st 11, .diag-swcap 11, .sub 11, #stGroupChips .chip 11/40, the Setup readiness rows 40",
    has(APP, ".tabb{flex:1 0 auto;min-width:58px;background:none;border:none;color:var(--muted);padding:9px 4px 10px;font-size:11px;") &&
    has(APP, ".nw-s{font-size:12px;") && has(APP, ".nw-tag{flex:0 0 auto;font-size:11px;") && has(APP, ".hsl-ctx{font-size:11px;") && has(APP, ".hsl-lab .hsl-ctx{font-size:11px}") &&
    has(APP, ".kick{font-size:11px;") && has(APP, ".im-card-sum{position:relative;margin:4px 0 8px;font-size:12px;") && has(APP, ".im-card-foot .im-tplcount{font-size:11px;") &&
    has(APP, ".im-lb{position:absolute;bottom:8px;font-size:11px;") && has(APP, ".hero-mini .kick{padding:10px 6px 0 0;font-size:.7rem;") && has(APP, "@media (max-width:389px){.hero-mini .kick{font-size:.69rem;") &&
    has(PCSS, "  font-size: 11px; font-weight: 800; letter-spacing: 0.02em;\n  padding: 9px 4px 10px;") &&
    has(PCSS, "  border-radius: 14px; padding: 6px 13px; font-size: 13px; font-weight: 700;\n  min-height: 40px; box-sizing: border-box; display: flex; flex-direction: row;") &&
    has(PCSS, "  font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }\n.subtab + .subtab { margin-left: 6px; }") &&
    has(PCSS, ".nw-tag{color:#1a1408;background:var(--gold);border-radius:999px;padding:3px 7px;font-size:11px;font-weight:900}") &&
    has(PCSS, ".diag-st { flex: 0 1 auto; min-width: 0; font-size: 11px;") && has(PCSS, ".diag-swcap { margin-left: 8px; font-size: 11px;") &&
    has(PCSS, "#stGroupChips .chip { flex: 0 0 auto; white-space: nowrap; min-height: 40px; padding: 4px 11px; font-size: 11px; margin-bottom: 0; }") &&
    has(PCSS, ".stpg #stMuCard .chip, .stpg #stEvCard .chip {\n  min-height: 40px;") &&
    has(PCSS, "#pageSetup .acc-kv-btn { min-height: 40px; align-items: center; margin-top: 4px; border-radius: 8px; }") &&
    has(PMAIN, 'row.className = "acc-kv acc-kv-btn";\n    row.setAttribute("role", "button");'), null);

  report("A8) ALTS — every icon <img> the panel builds says alt=\"\": iconTag, the ic-car / ic-xl / ic-h2 branches of icn(), the lifter's three SVG_MAP images (and the lifted module carries them), the wizard visual and the Gallery thumbs",
    has(RSS, "' icn-t\" alt=\"\" data-icn=\"' + name") &&
    has(RSS, "if (c.indexOf(\"ic-car\") >= 0) return '<img class=\"' + c + '\" alt=\"\" src=\"icons/ui/' + name + '-gold.png\">';") &&
    has(RSS, "if (c.indexOf(\"ic-xl\") >= 0) return '<img class=\"' + c + '\" alt=\"\" src=\"icons/ui/' + name + '-muted.png\">';") &&
    has(RSS, "if (c.indexOf(\"ic-h2\") >= 0) return '<img class=\"' + c + '\" alt=\"\" src=\"icons/ui/' + name + '-gold.png\">';") &&
    has(LIFTER, '<img class="icn ic-sa" alt="" src="icons/ui/st-reset-muted.png">') && has(LIFTER, '<img class="icn st-tgi" alt="" src="icons/ui/st-target-gold.png">') && has(LIFTER, '<img class="st-thph" alt="" src="icons/ui/st-thumb-ph-muted.png">') &&
    has(PSS, '<img class="icn ic-sa" alt="" src="icons/ui/st-reset-muted.png">') &&
    has(PMAIN, 'im.className = "wiz-visual"; im.alt = "";') &&
    has(PMAIN, 'im.alt = (item && item.name) ? String(item.name).slice(0, 80) : "gallery result";'), null);

  report("A9) the panel's studio discs are 40px elements around the 28px visual, layout box unchanged (margin -6px -3px, +3px between two)",
    has(PCSS, ".stpg .st-sact .sa {\n  display: flex; flex-direction: row; align-items: center; justify-content: center;\n  width: 40px; height: 40px; margin: -6px -3px; border-radius: 8px; color: var(--muted);\n}\n.stpg .st-sact .sa + .sa { margin-left: 3px; }") &&
    has(PCSS, "#pageAiTools .sa { display: flex; flex-direction: row; align-items: center; justify-content: center; width: 40px; height: 40px;\n  margin: -6px -3px; border-radius: 8px; color: var(--muted); }\n#pageAiTools .sa + .sa { margin-left: 3px; }"), null);
}

/* ================= B) the app at 390 × 844 ================= */
async function appWalk(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); } catch (e) { } });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2200);
  await page.evaluate(() => { try { document.body.classList.remove("wall"); } catch (e) { } const o = document.getElementById("onb"); if (o) o.remove(); const sp = document.getElementById("splash"); if (sp) sp.remove(); });
  const per = {};
  for (const id of APP_PAGES) {
    await page.evaluate((id) => { switchPage(id); window.scrollTo(0, 0); }, id); await page.waitForTimeout(450);
    per[id] = await page.evaluate(measure);
    per[id].hero = await heroBand(page);
  }
  const ovf = APP_PAGES.filter((id) => per[id].overflowX > 0).map((id) => id + ":" + per[id].overflowX);
  report("B1) nineteen pages at 390px, none wider than the screen", ovf.length === 0, ovf);
  const small = APP_PAGES.flatMap((id) => per[id].small.map((s) => id + " " + s));
  const targets = APP_PAGES.reduce((a, id) => a + per[id].targets, 0);
  report("B2) REACH — of the " + targets + " visible controls across the nineteen pages, none is under 40px in either dimension (the audit counted 217)", small.length === 0 && targets > 700, small.slice(0, 30));
  const smallOne = APP_PAGES.flatMap((k) => per[k].smallOneLine.map((s) => k + " " + s));
  report("B2b) REACH on one line — with every label forced onto a single line at a 1.15 line box (CI's runner has no Myanmar face; an English phone; the shortest of the nine languages) still none of the " + targets + " controls is under 40px tall: the floor holds with no help from the text (run 35486844206 caught the Gallery search box at 38 this way)", smallOne.length === 0, smallOne.slice(0, 30));
  const tiny = APP_PAGES.flatMap((id) => per[id].tiny.map((s) => id + " " + s));
  report("B3) READ — no text node under 11px on any page (the wordmark label and labels drawn inside SVG pictures excepted); the audit counted 677 under 12px", tiny.length === 0, tiny.slice(0, 30));
  const noAlt = APP_PAGES.flatMap((id) => per[id].imgNoAlt.map((s) => id + " " + s));
  report("B4) every visible <img> on every page carries an alt", noAlt.length === 0, noAlt.slice(0, 20));
  report("B5) FOCUS at runtime — the live stylesheets carry no :focus rule with outline:none and at least eleven :focus-visible rules", per.pgHome.focusOutlineNone === 0 && per.pgHome.focusVisibleRules >= 11, { none: per.pgHome.focusOutlineNone, rules: per.pgHome.focusVisibleRules });

  /* the key banner: full on Home, one line everywhere else, gone behind the wall and once a key is saved */
  const kb = await page.evaluate((pgs) => {
    const el = document.getElementById("keyBanner"); const out = {};
    const saved = state.rhKey; state.rhKey = ""; updateKeyBanner();
    for (const id of pgs) { switchPage(id); const cs = getComputedStyle(el); out[id] = { h: el.offsetHeight, compact: el.classList.contains("compact"), on: el.classList.contains("on"), nowrap: cs.whiteSpace === "nowrap", ellipsis: cs.textOverflow === "ellipsis", display: cs.display }; }
    switchPage("pgWf"); document.body.classList.add("wall"); out.wall = el.offsetHeight; document.body.classList.remove("wall");
    state.rhKey = "rh-test-key-value-placeholder"; updateKeyBanner(); out.withKey = el.offsetHeight;
    state.rhKey = saved; updateKeyBanner(); switchPage("pgHome");
    return out;
  }, APP_PAGES);
  const offHome = APP_PAGES.filter((id) => id !== "pgHome");
  report("B6) BANNER — without a key the banner stands on all nineteen pages: full on Home (no .compact, taller than 44px), one ellipsised nowrap line of at most 44px on the other eighteen; 0px behind the wall and 0px once a key is saved",
    kb.pgHome.on && !kb.pgHome.compact && kb.pgHome.h > 44 &&
    offHome.every((id) => kb[id].on && kb[id].compact && kb[id].h > 0 && kb[id].h <= 44 && kb[id].nowrap && kb[id].ellipsis && kb[id].display === "block") &&
    kb.wall === 0 && kb.withKey === 0, kb);

  /* rails: the first page whose sub-tab bar is on */
  const rail = await page.evaluate((pgs) => {
    for (const id of pgs) {
      switchPage(id);
      const bar = document.getElementById("subtabbar"); if (!bar || !bar.classList.contains("on")) continue;
      const on = bar.querySelector(".subtab.on"); const b = bar.getBoundingClientRect(), o = on && on.getBoundingClientRect();
      const cs = getComputedStyle(bar), before = getComputedStyle(bar, "::before");
      return { page: id, snap: cs.scrollSnapType, pad: cs.scrollPaddingLeft, beforeW: before.width, tabs: bar.querySelectorAll(".subtab").length, scrollable: bar.scrollWidth > bar.clientWidth + 2,
        activeInView: !!o && o.left >= b.left - 1 && o.right <= b.right + 1, align: on && getComputedStyle(on).scrollSnapAlign, tabH: on && Math.round(o.height) };
    }
    return null;
  }, APP_PAGES);
  report("B7) RAILS — a live sub-tab bar snaps on x, pads 40px, draws a 40px edge fade, its active pill snaps to centre, is ≥ 44px tall and sits fully inside the bar",
    !!rail && /x/.test(rail.snap) && rail.pad === "40px" && rail.beforeW === "40px" && rail.activeInView && rail.align === "center" && rail.tabH >= 44, rail);

  const heroes = APP_PAGES.filter((id) => per[id].hero).map((id) => ({ id, L: per[id].hero.L, loaded: per[id].hero.loaded }));
  report("B8) HERO — on every page with a hero (" + heroes.length + " of them) the picture has loaded and the band behind the heading reads at L ≤ " + HERO_BAND_MAX + " (≥ 4.5 : 1 against the cream text; the old scrim left Imagine at .217, Retouch B at .212, Retouch at .207, Path at .188, Home at .174)",
    heroes.length >= 14 && heroes.every((h) => h.loaded && h.L <= HERO_BAND_MAX), heroes);

  const tiers = await page.evaluate(() => {
    const root = document.documentElement; const v = () => getComputedStyle(root).getPropertyValue("--fs-sm").trim() + "/" + getComputedStyle(root).getPropertyValue("--fs-base").trim() + "/" + getComputedStyle(document.body).fontSize;
    root.classList.remove("tsize-s", "tsize-l"); const m = v(); root.classList.add("tsize-s"); const s = v(); root.classList.remove("tsize-s"); root.classList.add("tsize-l"); const l = v(); root.classList.remove("tsize-l"); return { s, m, l };
  });
  report("B9) the three text tiers measure 12/13/13.5px (Small), 13/14/15px (Normal), 14/15/17px (Large) for --fs-sm / --fs-base / body", tiers.s === "12px/13px/13.5px" && tiers.m === "13px/14px/15px" && tiers.l === "14px/15px/17px", tiers);
  report("B10) no page error during the walk", errs.length === 0, errs);
  await ctx.close();
}

/* ================= C) the panel at 360 × 900 ================= */
async function panelWalk(browser) {
  const server = http.createServer((req, res) => { const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html"; const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream" }); res.end(fs.readFileSync(abs)); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r)); const port = server.address().port;
  const page = await browser.newPage({ viewport: { width: 360, height: 900 } });
  const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  try {
    await page.route("**/*", (r) => { const u = r.request().url(); if (u.indexOf("127.0.0.1") >= 0) return r.continue(); if (r.request().resourceType() === "image") return r.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") }); return r.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
    await page.addInitScript(UXP_STUB);
    await page.addInitScript("window.__fx = " + FAKE_FS_SRC + "; window.HNK = window.HNK || {}; window.HNK.__uxpForTests = window.__fx.uxp;");
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" }); await page.waitForTimeout(2200);
    await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; } }, null, { timeout: 30000 }).catch(() => { throw new Error("the panel never signed in under the stub"); });
    const per = {};
    for (const key of PANEL_KEYS) {
      await page.evaluate((k) => { HNK.panelNav.switchPage(k); window.scrollTo(0, 0); }, key); await page.waitForTimeout(450);
      per[key] = await page.evaluate(measure);
    }
    const ovf = PANEL_KEYS.filter((k) => per[k].overflowX > 0).map((k) => k + ":" + per[k].overflowX);
    report("C1) eighteen panel pages at 360px, none wider than the panel", ovf.length === 0, ovf);
    const small = PANEL_KEYS.flatMap((k) => per[k].small.map((s) => k + " " + s));
    const targets = PANEL_KEYS.reduce((a, k) => a + per[k].targets, 0);
    report("C2) REACH — of the " + targets + " visible panel controls, none is under 40px (the audit counted 161: suite chips at 34/38, readiness rows at 26, discs at 28)", small.length === 0 && targets > 600, small.slice(0, 30));
    const smallOne = PANEL_KEYS.flatMap((k) => per[k].smallOneLine.map((s) => k + " " + s));
    report("C2b) REACH on one line — with every panel label forced onto a single line at a 1.15 line box still none of the " + targets + " controls is under 40px tall (run 35486844206 caught the watermark-position strip's four chips at 32 this way: two-line Burmese here, one line on the runner)", smallOne.length === 0, smallOne.slice(0, 30));
    const tiny = PANEL_KEYS.flatMap((k) => per[k].tiny.map((s) => k + " " + s));
    report("C3) READ — no panel text under 11px (the wordmark label excepted); the audit counted 773 under 12px, with .hsl-ctx at 8px and the SELF-TEST rows at 10px", tiny.length === 0, tiny.slice(0, 30));
    const noAlt = PANEL_KEYS.flatMap((k) => per[k].imgNoAlt.map((s) => k + " " + s));
    report("C4) ALTS — every visible panel <img> carries an alt (the audit counted 204 without, all icon pictures on the three Studio pages)", noAlt.length === 0, noAlt.slice(0, 20));
    report("C5) FOCUS at runtime — the panel stylesheet carries no :focus rule with outline:none", per.setup.focusOutlineNone === 0 && per.setup.focusVisibleRules >= 3, { none: per.setup.focusOutlineNone, rules: per.setup.focusVisibleRules });
    const setup = await page.evaluate(() => { HNK.panelNav.switchPage("setup"); const rows = Array.from(document.querySelectorAll("#pageSetup .acc-kv-btn")); return { n: rows.length, roles: rows.every((r) => r.getAttribute("role") === "button" && r.getAttribute("tabindex") === "0"), hs: rows.map((r) => Math.round(r.getBoundingClientRect().height)) }; });
    report("C6) the Setup readiness rows (jump buttons) carry .acc-kv-btn, role=button, tabindex 0 and measure ≥ 40px", setup.n >= 3 && setup.roles && setup.hs.every((h) => h >= 40), setup);
    const disc = await page.evaluate(() => { HNK.panelNav.switchPage("meitu"); const sa = document.querySelector(".stpg .st-sact .sa"); if (!sa) return null; const r = sa.getBoundingClientRect(), p = sa.parentElement.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), parentH: Math.round(p.height) }; });
    report("C7) a Retouch A section disc measures 40 × 40 while its action row stays under 32px tall (the -6px margins hold the layout box)", !!disc && disc.w === 40 && disc.h === 40 && disc.parentH <= 32, disc);
    report("C8) no page error during the panel walk", errs.length === 0, errs);
  } finally { await page.close(); server.close(); }
}

/* ================= D) the release ================= */
function releasePins() {
  const wn = JSON.parse(read("docs/app/data/whatsnew.js").replace(/^window\.HNK_WHATS_NEW=/, "").replace(/;\s*$/, ""));
  const row = wn[0];
  const manifest = JSON.parse(read("panel/manifest.json")), rel = JSON.parse(read("panel/release-manifest.json")), pv = JSON.parse(read("docs/download/panel-version.json")), ver = JSON.parse(read("docs/app/version.json"));
  /* 6.115.0 — this wave shipped as 6.114.0 / 6.185.0; every wave after it moves the pair on. What
     stays true is the LOCKSTEP: one app version in every app file, one panel version in every panel
     file, the landing carrying both, and the pair at or past this wave's. */
  const appV = (APP.match(/var APP_VER="([0-9.]+)";/) || [])[1], panV = (PMAIN.match(/const PANEL_VERSION = "([0-9.]+)";/) || [])[1];
  const ge = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; } return true; };
  report("D1) the release pair is in lockstep (this wave shipped as 6.114.0 / panel 6.185.0; the pair only moves forward): APP_VER, version.json, sw.js cache, API_VERSION agree; PANEL_VERSION, manifest, release-manifest (+ artifact file), panel-version.json agree; the download footer and the landing carry both",
    !!appV && !!panV && ge(appV, "6.114.0") && ge(panV, "6.185.0") && ver.v === appV && has(SW, 'var CACHE = "hnk-web-studio-v' + appV.replace(/\./g, "-") + '";') && has(read("server/index.js"), 'const API_VERSION = "' + appV + '";') &&
    manifest.version === panV && rel.version === panV && rel.artifact_file === "HNK_Ai_Panel_v" + panV + ".ccx" && pv.v === panV && pv.latest_version === panV &&
    has(read("docs/download/index.html"), "Web App " + appV + " · Panel " + panV) && has(LANDING, "Web Studio v" + appV) && has(LANDING, "Panel v" + panV) && !has(LANDING, "6.113.1") && !has(LANDING, "6.184.1"), { appV, panV, ver: ver.v, manifest: manifest.version, rel: rel.version, pv: pv.v });
  const row614 = wn.find((r) => r.v === "6.114.0");
  report("D2) the What's New strip carries the 6.114.0 row (it led the strip when this wave shipped) — title and story in all nine languages, pointing at Home — and the panel's lifted table carries it",
    !!row614 && row614.kind === "page" && row614.ref === "pgHome" && LANGS.every((l) => typeof row614.t[l] === "string" && row614.t[l].length > 8 && typeof row614.s[l] === "string" && row614.s[l].length > 80) &&
    has(read("panel/js/hnk_whats_new.js"), '"6.114.0"'), row614 && { v: row614.v, lead: wn[0].v, langs: LANGS.map((l) => (row614.t[l] || "").length + "/" + (row614.s[l] || "").length) });
  report("D3) CI runs this test and the landing says how many tests the suite runs (256 when this wave shipped, 257 since 6.115.0 added verify_ux_wave_6115, 258 since 6.116.0 added verify_ux_wave_6116, 259 since 6.117.0 added verify_ux_wave_6117, 260 since 6.118.0 added verify_ux_wave_6118, 261 since 6.119.0 added verify_ux_wave_6119, 262 since 6.120.0 added verify_ux_wave_6120, 263 since 6.121.0 added verify_album_designer, 264 since 6.122.0 added verify_album_wave_g, 265 since 6.123.0 added verify_prop_wave_h)", has(CI, "run: node test/verify_ux_wave_6114.js") && (CI.match(/node test\//g) || []).length === 265 && has(LANDING, "265 tests") && !has(LANDING, "255 tests"),
    { invocations: (CI.match(/node test\//g) || []).length });
}

(async () => {
  sourcePins();
  const browser = withPremium(await chromium.launch());
  try {
    await appWalk(browser);
    await panelWalk(browser);
  } finally { await browser.close(); }
  releasePins();
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS — every control reaches 40px, no text under 11px, one focus ring, legible hero headings, a one-line banner off Home, and every icon says alt, on both surfaces");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("FAIL —", e && e.stack || e); process.exit(1); });
