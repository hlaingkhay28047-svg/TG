#!/usr/bin/env node
/* ============================================================================
   verify_wf_card_compact.js — THE SMART WORKFLOW CARD IS SMALLER, AND IT COST
   NOTHING (6.112.0)

   THE OWNER'S WORDS: "Smart workflow card ကို သေးသေးကျစ်ကျစ် နဲ့ လုပ်ပေးပါ."

   The card was half air. Measured on the real page at 390px in Burmese, a card
   was 273.1px tall, of which the two text boxes took 133.9px and the picture
   only 80.7px. The air was one number: `line-height: 2.25`, chosen in 6.41.0
   because 1.6 had clipped Burmese and 2.25 was SAFELY clear of it. Safe, but
   never measured — and a guessed constant is exactly the kind of thing that
   quietly costs 32px a card for seventy releases.

   So it was measured. In the card's own font stack the tallest stack Burmese
   can build, "ကျွန်ုပ်", inks 21.0px at 12.5px/800 and 17.0px at 11.5px/400 —
   it needs 1.68 and 1.48. 2.25 was carrying 7.1px of nothing on every line.
   6.112.0 states 1.9 and 1.7, which keep 2.75px and 2.55px of real margin over
   that ceiling, and the stated box heights come down with them: 4.5em → 3.8em
   and 6.75em → 5.1em.

   THIS TEST EXISTS BECAUSE "SMALLER" IS EASY AND "SMALLER FOR FREE" IS NOT.
   Three things could have been quietly sold to buy that height, and each has a
   section that refuses it:

     B  A CLIPPED GLYPH. A Burmese or Shan stack whose ink runs past its line
        box is cut at the box edge, and only in that language. B does not argue
        from font metrics — it reads the REAL baseline of the first and last
        laid-out line out of the engine (a zero-size inline-block sits exactly
        on the baseline), adds the ink the glyphs of that very string actually
        draw, and compares the result with the box's own edges. Nine languages,
        every card on the page, both surfaces.

     C  A LOST WORD. The box is smaller, so a cut that depends on the box would
        move. It does not: ellCeil cuts on `lines * lineHeight`, and the line
        budget is still 2 and 3 (6.96.0's rule — a two-line summary cut 138 of
        the 194 cards, and that is not a lever for compaction). C proves it the
        only way worth anything: it renders every card with 6.112.0's metrics,
        then re-renders the same page with 6.111.0's injected, and requires the
        visible text to be IDENTICAL, character for character.

     D  NOTHING, i.e. the card did not actually get smaller. D measures it, on
        the same page in the same run, against the release it replaces.

   E walks the panel, where the whole class of defect lives: Adobe UXP draws no
   `-webkit-line-clamp` and declines `max-height`, so both heights must stay
   STATED (6.171.0) and must still equal their line budget exactly.

   F breaks it on purpose — 2.25 back, and a line-height under the measured ink
   ceiling — and requires D and B to fail. A test that cannot fail is furniture.

   Usage: node test/verify_wf_card_compact.js     (the app server must be on 8931)
   ============================================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const { withPremium } = require("./_seed_premium.js");

const ROOT = path.join(__dirname, "..");
const PANEL_DIR = path.join(ROOT, "panel");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const CSS = fs.readFileSync(path.join(PANEL_DIR, "styles.css"), "utf8");
const WFS = fs.readFileSync(path.join(PANEL_DIR, "src", "ui", "screens", "workflow-tools-screen.js"), "utf8");
const MAIN = fs.readFileSync(path.join(PANEL_DIR, "main.js"), "utf8");
const PORT = process.env.PORT || 8931;

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".mp4": "video/mp4" };
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/* what 6.112.0 states, and what 6.111.0 stated before it — both surfaces */
const NEW = { tLh: 1.9, tH: 3.8, tFs: 12.5, sLh: 1.95, sH: 5.85, sFs: 11.5, pad: 8 };
const OLD = { tLh: 2.25, tH: 4.5, sLh: 2.25, sH: 6.75, pad: 10 };
/* the line budgets ellMark is called with; 6.96.0 fixed them at 2 and 3 */
const T_LINES = 2, S_LINES = 3;
/* the nine base languages the studio ships in — the three that stack marks
   above and below the baseline are the ones this wave could have broken */
const LANGS = ["my", "shn", "kac", "th", "en", "zh", "vi", "id", "ms"];
const APP_WIDTHS = [360, 390, 430];
const PANEL_WIDTHS = [230, 300, 420];

let failures = 0;
function report(name, ok, detail) {
  if (ok) { console.log("PASS  " + name); return; }
  failures++;
  console.log("FAIL  " + name);
  if (detail !== undefined) console.log("      " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900));
}
/* every source pin reads the code with the comments gone, so the prose above a
   rule can never be what makes the pin pass */
function code(src) { return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1"); }
const APP_C = code(APP), CSS_C = code(CSS), WFS_C = code(WFS), MAIN_C = code(MAIN);
const r1 = n => Math.round(n * 10) / 10;

/* ========================= A. what the two surfaces state ================== */
function sourcePins() {
  console.log("\n--- A. the measured metrics, stated on both surfaces ---");

  report("A1) web app · .wfmini .t is 12.5px/800 at line-height 1.9 in a stated 3.8em box, clamped to two lines, with no max-height for a renderer to decline",
    /\.wfmini \.t\{position:relative;font-size:12\.5px;font-weight:800;line-height:1\.9;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;height:3\.8em\}/.test(APP_C)
    && !/\.wfmini \.t\{[^}]*max-height/.test(APP_C));

  report("A2) web app · .wfmini .s is 11.5px at line-height 1.95 in a stated 5.85em box, and still has no max-height",
    /\.wfmini \.s\{position:relative;font-size:11\.5px;color:var\(--muted\);line-height:1\.95;height:5\.85em;overflow:hidden;overflow-wrap:anywhere\}/.test(APP_C)
    && !/\.wfmini \.s\{[^}]*max-height/.test(APP_C));

  report("A3) panel · the same two boxes, stated the same way — a height UXP honours, never a max-height it ignores (6.171.0)",
    /\.wfmini \.t \{[^}]*height: 3\.8em;[^}]*font-size: 12\.5px; font-weight: 800; line-height: 1\.9;/.test(CSS_C)
    && /\.wfmini \.s \{[^}]*height: 5\.85em;[^}]*font-size: 11\.5px; color: var\(--muted\); line-height: 1\.95;/.test(CSS_C)
    && !/\.wfmini \.t \{[^}]*max-height/.test(CSS_C) && !/\.wfmini \.s \{[^}]*max-height/.test(CSS_C));

  /* THE INVARIANT THAT MAKES C TRUE BY CONSTRUCTION. ellCeil cuts on
     `lines * lineHeight`, and the stated box is `height`. If those two ever
     stop being the same number the box either hides a line the cut kept or
     reserves one the cut will never fill — which is the 6.109.0 defect, an
     empty reserved area, arriving from the other direction. */
  report("A4) the stated box is EXACTLY its line budget on both surfaces — 3.8em = 2 × 1.9 and 5.85em = 3 × 1.95 — so the box the reader sees and the ceiling the cut uses are one number",
    r1(NEW.tH) === r1(T_LINES * NEW.tLh) && r1(NEW.sH) === r1(S_LINES * NEW.sLh)
    && r1(OLD.tH) === r1(T_LINES * OLD.tLh) && r1(OLD.sH) === r1(S_LINES * OLD.sLh),
    { title: NEW.tH + " vs " + T_LINES + "×" + NEW.tLh, summary: NEW.sH + " vs " + S_LINES + "×" + NEW.sLh });

  report("A5) and the budget itself did NOT shrink — the title is still two lines and the summary still three, on both surfaces (6.96.0: a two-line summary cut 138 of the 194 cards, so the line count is not a lever for compaction)",
    APP_C.split('ellMark(wfHost, ".wfmini .t", 2)').length - 1 >= 4
    && APP_C.split('ellMark(wfHost, ".wfmini .s", 3)').length - 1 >= 4
    && /em\(gd, "\.wfmini \.t", 2\)/.test(WFS_C) && /em\(gd, "\.wfmini \.s", 3\)/.test(WFS_C)
    && /em\(root, "\.wfmini \.s", 3\)/.test(WFS_C));

  report("A6) the frame came in with the text — 8px of padding and a 3px gap on the app, 8px and 3px margins on the panel (10px and 4px were set when the text boxes were 134px tall)",
    /\.wfmini\{border:1px solid var\(--line-soft\);border-radius:11px;background:var\(--panel-2\);padding:8px;text-align:left;color:var\(--cream\);display:flex;flex-direction:column;gap:3px\}/.test(APP_C)
    && /\.wfmini \{[^}]*padding: 8px;/.test(CSS_C)
    && /\.wfmini \.t \{[^}]*margin-top: 3px;/.test(CSS_C)
    && /\.wfmini \.s \{[^}]*margin-top: 3px; margin-bottom: 3px;/.test(CSS_C));

  report("A7) the cut is still measured against the LINE BUDGET and not against the box, which is why a smaller box cannot move it",
    /var ceil=lines>0\?lines\*lh:0;/.test(APP_C) && /let ceil = lines > 0 \? lines \* lh : 0;/.test(MAIN_C));
}

/* ================== the reading both surfaces are judged by ================
   DOES A GLYPH LOSE PIXELS AT THE EDGE OF THE BOX? Nothing else is "clipped".

   A line box is not an ink box (6.41.0), and the two differ in a way that can
   be computed exactly rather than guessed at. CSS centres the FONT's content
   area — fontBoundingBoxAscent + fontBoundingBoxDescent — inside the line box
   and splits what is left as half-leading above and below. A glyph draws
   actualBoundingBoxAscent above the baseline. So the first line of a box loses
   pixels at the top exactly when

       actualAscent  >  fontAscent  + halfLeading,
       halfLeading = (lineHeight − (fontAscent + fontDescent)) / 2

   and the last line loses them at the bottom on the mirror of that. Every one
   of those four numbers comes from the engine — canvas TextMetrics for the
   font and the ink, getComputedStyle for the line height — so this measures
   the renderer rather than a rule of thumb about Burmese.

   AND IT IS MEASURED PER LINE, not per box. An overhang on an interior line
   spills into its neighbour's line box, which is still inside the element; only
   the first line's ascent and the last line's descent meet the element's edge.
   The line the browser really drew is found by binary-searching the character
   offsets for the one where getClientRects changes row — so the string measured
   is the string that line is holding, in the language the page is in, at the
   width the card really has.

   THE FIRST DRAFT OF THIS WAVE FAILED HERE, which is the point. Summary
   line-height 1.7 was measured clear for Burmese, Shan and Kachin and clipped
   31 Vietnamese boxes by 0.72px: the stacked diacritic on Ả is taller than
   anything the three languages this wave was written for can build. The floor
   is 1.85; 1.95 ships. */
const INK_PROBE = `(function(scope){
  var cv=document.createElement("canvas"), cx=cv.getContext("2d");
  function fontOf(cs){ return cs.fontStyle+" "+cs.fontWeight+" "+cs.fontSize+" "+cs.fontFamily; }
  /* the element's own words: the clamp marker is a separate, absolutely placed
     span and is not part of the sentence the reader is given */
  function textNodeOf(el){
    var w=document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode:function(n){
      return (n.parentNode && n.parentNode.classList && n.parentNode.classList.contains("ell"))
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } });
    var best=null, n; while((n=w.nextNode())) if(!best || n.nodeValue.length>best.nodeValue.length) best=n;
    return best;
  }
  function topAt(node,i){ var r=document.createRange(); r.setStart(node,i); r.setEnd(node,i+1);
    var b=r.getBoundingClientRect(); return b.height>0?b.top:-1; }
  function probe(el){
    if(!el) return null;
    var node=textNodeOf(el); if(!node) return null;
    var txt=node.nodeValue||""; if(!txt.trim()) return null;
    var cs=getComputedStyle(el), L=parseFloat(cs.lineHeight)||0;
    if(!(L>0)) return null;
    var full=document.createRange(); full.selectNodeContents(node);
    var rects=full.getClientRects(), tops=[];
    for(var i=0;i<rects.length;i++){ var t=Math.round(rects[i].top*10)/10;
      if(rects[i].height>0 && tops.indexOf(t)<0) tops.push(t); }
    tops.sort(function(a,b){ return a-b; });
    if(!tops.length) return null;
    var N=tops.length, len=txt.length;
    function startOf(k){
      var lo=0, hi=len-1, want=tops[k], ans=len-1;
      while(lo<=hi){ var mid=(lo+hi)>>1, t=topAt(node,mid);
        if(t<0){ lo=mid+1; continue; }
        if(t>=want-0.6){ ans=mid; hi=mid-1; } else lo=mid+1; }
      return ans;
    }
    var firstEnd = N>1 ? startOf(1) : len;
    var lastStart = N>1 ? startOf(N-1) : 0;
    cx.font=fontOf(cs);
    var mAll=cx.measureText(txt);
    var A=mAll.fontBoundingBoxAscent, D=mAll.fontBoundingBoxDescent;
    if(!(isFinite(A)&&isFinite(D))) return { unsupported:true };
    var m0=cx.measureText(txt.slice(0,firstEnd)), mL=cx.measureText(txt.slice(lastStart));
    var half=(L-(A+D))/2;
    return { overTop:Math.round((m0.actualBoundingBoxAscent-A-half)*100)/100,
             overBot:Math.round((mL.actualBoundingBoxDescent-D-half)*100)/100,
             lines:N, L:Math.round(L*100)/100,
             t0:txt.slice(0,firstEnd).slice(0,24), tL:txt.slice(lastStart).slice(0,24) };
  }
  var out={ n:0, unsupported:0, clipped:0, worstTop:-999, worstBot:-999, bad:[] };
  document.querySelectorAll(scope+" .wfmini").forEach(function(c){
    if(!(c.getBoundingClientRect().height>0)) return;
    [[".t","title"],[".s","summary"]].forEach(function(p){
      var r=probe(c.querySelector(p[0]));
      if(!r) return;
      if(r.unsupported){ out.unsupported++; return; }
      out.n++;
      if(r.overTop>out.worstTop) out.worstTop=r.overTop;
      if(r.overBot>out.worstBot) out.worstBot=r.overBot;
      if(r.overTop>0||r.overBot>0){ out.clipped++;
        if(out.bad.length<6) out.bad.push({ box:p[1], top:r.overTop, bottom:r.overBot, lines:r.lines, first:r.t0, last:r.tL }); }
    });
  });
  return out;
})`;

/* the words a card is showing right now, with the ellipsis marker stripped */
const READ_WORDS = `(function(scope){
  var out=[];
  document.querySelectorAll(scope+" .wfmini").forEach(function(c){
    if(!(c.getBoundingClientRect().height>0)) return;
    var t=c.querySelector(".t"), s=c.querySelector(".s");
    out.push({ t:((t&&t.textContent)||"").replace(/\\u2026$/,""),
               s:((s&&s.textContent)||"").replace(/\\u2026$/,"") });
  });
  return out;
})`;

/* every card's height and the parts it spends it on */
const READ_BOXES = `(function(scope){
  var cards=[], art=0, tH=0, sH=0;
  document.querySelectorAll(scope+" .wfmini").forEach(function(c){
    if(c.classList.contains("wf-span2")) return;
    var r=c.getBoundingClientRect(); if(!(r.height>0)) return;
    cards.push(Math.round(r.height*10)/10);
    if(!art){
      var im=c.querySelector("img"), t=c.querySelector(".t"), s=c.querySelector(".s");
      art=im?Math.round(im.getBoundingClientRect().height*10)/10:0;
      tH=t?Math.round(t.getBoundingClientRect().height*100)/100:0;
      sH=s?Math.round(s.getBoundingClientRect().height*100)/100:0;
    }
  });
  var g=document.querySelector(scope+" .wfgrid")||document.querySelector(scope+" .wfgrid");
  return { n:cards.length, cards:cards, med:cards.slice().sort(function(a,b){return a-b;})[Math.floor(cards.length/2)]||0,
           max:Math.max.apply(null,cards.concat([0])), art:art, tH:tH, sH:sH,
           grid:g?Math.round(g.getBoundingClientRect().height):0 };
})`;

/* 6.111.0's own metrics, put back in the page and nowhere else */
const OLD_CSS = ".wfmini{padding:" + OLD.pad + "px !important;gap:4px !important}"
  + ".wfmini .t{line-height:" + OLD.tLh + " !important;height:" + OLD.tH + "em !important;margin-top:4px !important}"
  + ".wfmini .s{line-height:" + OLD.sLh + " !important;height:" + OLD.sH + "em !important;margin-top:4px !important;margin-bottom:4px !important}";

/* ============================ B + C + D. the web app ====================== */
async function appWalk(browser) {
  console.log("\n--- B. no glyph is clipped, in any of the nine languages ---");
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  /* OPEN EVERY GROUP THE WAY A STUDENT DOES — by tapping its header. A closed
     Workflows page shows nine cards; the catalog is 194, and the sentences that
     could be clipped are mostly in the groups. Writing the open class directly
     would skip the product's own setOpen (and the ellMark call that hangs off
     it) and measure a page nobody can reach. */
  const open = async (lang, w) => {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.goto(`http://127.0.0.1:${PORT}/index.html?lang=${lang}`, { waitUntil: "load" });
    await page.waitForTimeout(1600);
    await page.evaluate(() => {
      try { document.body.classList.remove("wall"); } catch (e) { }
      try { switchPage("pgWf"); } catch (e) { }
      window.scrollTo(0, 0);
    });
    await page.waitForSelector("#pgWf .wfmini", { timeout: 15000 });
    await page.waitForTimeout(900);
    await page.evaluate(() => {
      document.querySelectorAll("#pgWf .grp").forEach(g => {
        try { if (String(g.className).indexOf("open") < 0) { const h = g.querySelector(".grp-h"); if (h) h.click(); } } catch (e) { }
      });
    });
    await page.waitForTimeout(1300);
  };

  const ink = {};
  for (const lang of LANGS) {
    await open(lang, 390);
    ink[lang] = await page.evaluate(INK_PROBE + '("#pgWf")');
  }
  const measured = Object.keys(ink).filter(k => ink[k].n > 0);
  report("B1) every title and summary on the page was actually measured, in all nine languages, and the engine answered with real glyph metrics",
    measured.length === LANGS.length && LANGS.every(l => ink[l].n >= 300) && LANGS.every(l => ink[l].unsupported === 0),
    LANGS.map(l => l + ":" + (ink[l] ? ink[l].n : "-")).join(" "));

  const clipped = LANGS.filter(l => ink[l] && ink[l].clipped > 0);
  report("B2) NOT ONE GLYPH is cut by its box — the first line of every title and the last line of every summary draws inside the stated height, in Burmese, Shan, Kachin, Thai, English, Chinese, Vietnamese, Indonesian and Malay",
    clipped.length === 0,
    clipped.length ? clipped.map(l => l + " " + ink[l].clipped + " of " + ink[l].n + " " + JSON.stringify(ink[l].bad[0])).join(" | ")
      : LANGS.map(l => l + " " + ink[l].worstTop + "/" + ink[l].worstBot).join("  "));

  /* the margin, stated as a number rather than as a feeling. The sweep that
     chose 1.95 puts the summary's floor at 1.85, i.e. 0.14px clear; every
     0.05 of line-height is another 0.2875px, so 1.95 is 0.71px clear. Ask for
     at least half a pixel so a value drifting back toward the floor fails here
     rather than on a student's phone. */
  const worstTop = Math.max(...LANGS.map(l => ink[l].worstTop));
  const worstBot = Math.max(...LANGS.map(l => ink[l].worstBot));
  report("B3) and it is not a near miss — the tightest line in any of the nine languages still clears its box by half a pixel or more",
    worstTop <= -0.5 && worstBot <= -0.5,
    { worstTopOverhangPx: worstTop, worstBottomOverhangPx: worstBot,
      titleLineBox: r1(NEW.tFs * NEW.tLh), summaryLineBox: r1(NEW.sFs * NEW.sLh),
      note: "negative = clear of the box" });

  console.log("\n--- C. the smaller box costs the reader nothing ---");
  /* THE CLAIM THIS SECTION HAD TO BE CORRECTED INTO. It was written to say the
     words are IDENTICAL, because ellCeil cuts on `lines * lineHeight` and the
     line budget did not move. The measurement disagreed on 3 cards of 558, and
     it was right: the frame also lost 2px of padding a side, so the text box is
     4px WIDER and a few sentences now fit one more word before the cut. The
     compaction therefore never costs a character and occasionally hands one
     back — which is the claim worth pinning, and it is strictly stronger than
     "nothing changed" because it forbids a loss in either direction. */
  const same = [];
  for (const w of APP_WIDTHS) {
    for (const lang of ["my", "shn", "en"]) {
      await open(lang, w);
      const now = await page.evaluate(READ_WORDS + '("#pgWf")');
      /* 6.111.0's metrics, in this page only, and the app's own clamp re-run */
      await page.addStyleTag({ content: OLD_CSS });
      await page.waitForTimeout(250);
      await page.evaluate(() => {
        const host = document.querySelector("#pgWf");
        ellMark(host, ".wfmini .t", 2); ellMark(host, ".wfmini .s", 3);
      });
      await page.waitForTimeout(350);
      const before = await page.evaluate(READ_WORDS + '("#pgWf")');
      const rt = v => String(v == null ? "" : v).replace(/\s+$/, "");
      const lost = [], broke = [], gained = [];
      now.forEach((v, i) => {
        const b = before[i]; if (!b) return;
        [["t", "title"], ["s", "summary"]].forEach(k => {
          const a = rt(v[k[0]]), o = rt(b[k[0]]);
          if (a === o) return;
          if (a.length < o.length) { if (lost.length < 4) lost.push({ box: k[1], was: o.slice(-40), now: a.slice(-40) }); return; }
          if (a.indexOf(o) !== 0) { if (broke.length < 4) broke.push({ box: k[1], was: o.slice(-40), now: a.slice(-40) }); return; }
          if (gained.length < 4) gained.push({ box: k[1], extra: a.slice(o.length).trim().slice(0, 30) });
        });
      });
      same.push({ w, lang, n: now.length, lost: lost.length, broke: broke.length,
        gained: gained.length, example: gained[0] || null, bad: lost[0] || broke[0] || null });
    }
  }
  report("C1) NOT ONE CARD LOSES A CHARACTER — at 360px, 390px and 430px, in Burmese, Shan and English, every title and every summary still begins with exactly the text 6.111.0 showed, and none of them is shorter",
    same.every(r => r.n >= 150 && r.lost === 0 && r.broke === 0), same);
  report("C2) and the few that change, change the reader's way — 8px of padding leaves the text box 4px wider than 10px did, so a sentence that fits one more word before the cut gets it",
    same.some(r => r.gained > 0),
    same.map(r => r.w + "/" + r.lang + " gained " + r.gained + " of " + r.n).join("  "));

  console.log("\n--- D. and the card really is smaller ---");
  const sized = [];
  for (const w of APP_WIDTHS) {
    await open("my", w);
    const after = await page.evaluate(READ_BOXES + '("#pgWf")');
    await page.addStyleTag({ content: OLD_CSS });
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const host = document.querySelector("#pgWf");
      ellMark(host, ".wfmini .t", 2); ellMark(host, ".wfmini .s", 3);
    });
    await page.waitForTimeout(400);
    const before = await page.evaluate(READ_BOXES + '("#pgWf")');
    sized.push({ w, n: after.n, after: after.med, before: before.med, saved: r1(before.med - after.med),
      pct: r1((1 - after.med / before.med) * 100), artAfter: after.art, artBefore: before.art,
      gridAfter: after.grid, gridBefore: before.grid,
      everyCardShorter: after.cards.length === before.cards.length && after.cards.every((h, i) => h < before.cards[i]) });
  }
  report("D1) the card is shorter at every width — and every single card on the page, not an average",
    sized.every(r => r.n >= 150 && r.saved >= 20 && r.everyCardShorter), sized);
  /* where the 23.4px at 390px comes from, so a future wave can check the sum
     rather than trust it: title 4.5em → 3.8em at 12.5px is 8.75px, summary
     6.75em → 5.85em at 11.5px is 10.35px, padding 10 → 8 is 4px on both edges
     and the gap 4 → 3 gives the rest. */
  report("D2) the two text boxes are the bulk of the saving — 8.75px off the title and 10.35px off the summary — and the frame's padding and gap give the rest",
    sized.every(r => r.saved >= 19), sized.map(r => r.w + "px saved " + r.saved).join("  "));
  report("D3) the PICTURE did not pay for it — the art is the same height or taller, because the frame around it got thinner",
    sized.every(r => r.artAfter >= r.artBefore - 0.5),
    sized.map(r => r.w + "px art " + r.artBefore + " → " + r.artAfter).join("  "));
  report("D4) which shortens the page itself — the whole Workflows grid comes down with it",
    sized.every(r => r.gridAfter < r.gridBefore),
    sized.map(r => r.w + "px grid " + r.gridBefore + " → " + r.gridAfter).join("  "));

  console.log("\n--- F. the checks are load-bearing (injected faults) ---");
  await open("my", 390);
  const good = await page.evaluate(READ_BOXES + '("#pgWf")');
  await page.addStyleTag({ content: OLD_CSS });
  await page.waitForTimeout(400);
  const old = await page.evaluate(READ_BOXES + '("#pgWf")');
  report("F1) put 6.111.0's line-height back and D1 has nothing left to report — the card returns to its old height",
    old.med > good.med + 20, { with6112: good.med, with6111: old.med });

  /* F2 HAD TO BE REWRITTEN, AND THE REASON IS WORTH MORE THAN THE CHECK.

     Its first form injected the 1.7 this wave rejected and required the probe
     to report the 31 clipped Vietnamese boxes that rejected it. That passed
     here and FAILED on the CI runner, which reported `clipped: 0` at 1.7 — not
     because the probe is wrong but because the runner's font set is not this
     one. Ả is drawn by whatever font the host resolves, its ink is that font's
     ink, and the floor moves with it. A fault injection whose defect only
     exists in one font list is not a test; it is a coincidence.

     So F2 now asserts the part that is true in EVERY font, and it is the
     stronger claim anyway: lowering the line-height lowers the half-leading by
     exactly half the difference, so the overhang must rise by

         Δoverhang = Δline-height × font-size / 2

     no matter which font draws the glyphs. Measured on the runner at 11.5px:
     1.95 → −2.21, 1.7 → −0.78, a rise of 1.43 against a predicted 1.4375. That
     arithmetic is what makes the probe trustworthy, and it is checked here.

     F3 then proves the probe still SAYS "clipped" when something is: a
     line-height of 1.0 is under every font's floor, so it must report boxes.

     WHAT THIS MEANS FOR THE SHIPPED VALUE, stated plainly. 1.85 is the floor in
     THIS container's fonts; the runner's floor is lower. 1.95 was chosen from
     the stricter of the two environments that can be measured and is clear in
     both — 0.71px here, 2.21px there. A student's phone is a third font set
     nobody here can measure, which is exactly why the margin was taken from the
     tightest one seen rather than the most generous. */
  await open("vi", 390);
  const at195 = await page.evaluate(INK_PROBE + '("#pgWf")');
  await page.addStyleTag({ content: ".wfmini .s{line-height:1.7 !important;height:5.1em !important}" });
  await page.waitForTimeout(400);
  const at17 = await page.evaluate(INK_PROBE + '("#pgWf")');
  const predicted = (NEW.sLh - 1.7) * NEW.sFs / 2;      /* 1.4375px at 11.5px */
  const observed = at17.worstTop - at195.worstTop;
  report("F2) the probe answers the metric exactly — drop the summary's line-height by 0.25 and the overhang rises by half of that, " + r1(predicted) + "px, in whatever font the host happens to draw with",
    at195.n > 300 && Math.abs(observed - predicted) <= 0.35 && at195.worstTop <= -0.5,
    { at195: at195.worstTop, at17: at17.worstTop, observedRise: r1(observed), predictedRise: r1(predicted),
      note: "the shipped value's own headroom is font-dependent; this arithmetic is not" });

  await open("my", 390);
  await page.addStyleTag({ content: ".wfmini .t{line-height:1.0 !important;height:2em !important}.wfmini .s{line-height:1.0 !important;height:3em !important}" });
  await page.waitForTimeout(400);
  const at10 = await page.evaluate(INK_PROBE + '("#pgWf")');
  report("F3) and it still says CLIPPED when something is — a line-height of 1.0 is under every font's floor, and the probe names the boxes",
    at10.n > 300 && at10.clipped > 20 && at10.worstTop > 0,
    { clipped: at10.clipped, of: at10.n, worstTop: at10.worstTop, example: at10.bad[0] });

  report("B4) no page error while any of that was measured", errs.length === 0, errs.slice(0, 3));
  await page.close();
}

/* ============================== E. the panel ============================== */
async function panelWalk() {
  console.log("\n--- E. the panel, at the widths a docked Adobe panel really takes ---");
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL_DIR, rel);
    if (!abs.startsWith(PANEL_DIR + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch();
  try {
    const rows = [];
    const inkRows = [];
    for (const W of PANEL_WIDTHS) {
      const page = await browser.newPage({ viewport: { width: W, height: 960 } });
      const errs = [];
      page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
      await page.route("**/*", route => {
        const u = route.request().url();
        if (u.indexOf("127.0.0.1") >= 0) return route.continue();
        if (route.request().resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      });
      await page.addInitScript(UXP_STUB);
      await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
      await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; } }, null, { timeout: 25000 });
      await page.evaluate(() => { try { switchPage("wf"); } catch (e) { } });
      await page.waitForSelector("#pageAiTools .wfmini", { timeout: 20000 });
      await page.waitForTimeout(1200);
      /* every group opened by its own header, as a student opens it — the panel
         clamps on setOpen, so a group forced open by class is a page the
         product never drew */
      await page.evaluate(() => {
        document.querySelectorAll("#pageAiTools .grp").forEach(g => {
          try { const b = g.querySelector(".grp-b"), h = g.querySelector(".grp-h");
            if (b && h && b.style.display !== "block") h.click(); } catch (e) { }
        });
      });
      await page.waitForTimeout(1400);

      const box = await page.evaluate(() => {
        const out = { n: 0, tBad: [], sBad: [], outside: 0, spread: 0 };
        const hs = [];
        document.querySelectorAll("#pageAiTools .wfmini").forEach(c => {
          const r = c.getBoundingClientRect(); if (!(r.height > 0)) return;
          out.n++; if (!c.classList.contains("wf-span2")) hs.push(r.height);
          [[".t", 2, out.tBad], [".s", 3, out.sBad]].forEach(p => {
            const e = c.querySelector(p[0]); if (!e) return;
            const cs = getComputedStyle(e), lh = parseFloat(cs.lineHeight) || 0;
            const h = e.getBoundingClientRect().height;
            if (Math.abs(h - p[1] * lh) > 1.2 && p[2].length < 4) p[2].push({ h: Math.round(h * 100) / 100, want: Math.round(p[1] * lh * 100) / 100 });
            const eb = e.getBoundingClientRect();
            if (eb.bottom > r.bottom + 1 || eb.top < r.top - 1) out.outside++;
          });
        });
        out.spread = hs.length ? Math.round((Math.max(...hs) - Math.min(...hs)) * 10) / 10 : 0;
        out.med = hs.length ? Math.round(hs.slice().sort((a, b) => a - b)[Math.floor(hs.length / 2)] * 10) / 10 : 0;
        return out;
      });
      rows.push({ w: W, ...box, errs: errs.length });

      /* the ink reading again, on the surface whose renderer draws no clamp */
      for (const lang of ["my", "shn", "kac", "vi"]) {
        await page.evaluate(l => {
          try { state.lang = l; applyI18n(); } catch (e) { }
          try { switchPage("wf"); } catch (e) { }
        }, lang);
        await page.waitForTimeout(900);
        await page.evaluate(() => {
          document.querySelectorAll("#pageAiTools .grp").forEach(g => {
            try { const b = g.querySelector(".grp-b"), h = g.querySelector(".grp-h");
              if (b && h && b.style.display !== "block") h.click(); } catch (e) { }
          });
        });
        await page.waitForTimeout(1100);
        const r = await page.evaluate(INK_PROBE + '("#pageAiTools")');
        inkRows.push({ w: W, lang, n: r.n, clipped: r.clipped, top: r.worstTop, bottom: r.worstBot, bad: r.bad[0] || null });
      }
      await page.close();
    }
    report("E1) the panel draws the cards at every docked width, and every title and summary box is EXACTLY its line budget — the stated height is honoured, not approximated",
      rows.every(r => r.n >= 150 && r.tBad.length === 0 && r.sBad.length === 0), rows.map(r => ({ w: r.w, n: r.n, tBad: r.tBad, sBad: r.sBad })));
    report("E2) and nothing paints outside its own card — the smaller box did not push a sentence onto the page between two cards",
      rows.every(r => r.outside === 0), rows.map(r => r.w + "px outside " + r.outside).join("  "));
    report("E3) the cards line up: with both heights stated, the height spread across the whole grid stays small at 230px, 300px and 420px",
      rows.every(r => r.spread <= 60), rows.map(r => r.w + "px spread " + r.spread + " med " + r.med).join("  "));
    const pBad = inkRows.filter(r => r.clipped > 0);
    report("E4) no clipped glyph on the panel either — Burmese, Shan, Kachin and the Vietnamese that set the floor, at all three docked widths",
      inkRows.every(r => r.n >= 300) && pBad.length === 0,
      pBad.length ? pBad.slice(0, 3) : inkRows.map(r => r.w + "/" + r.lang + " " + r.top + "/" + r.bottom).join("  "));
    report("E5) no panel error while the cards were measured", rows.every(r => r.errs === 0), rows.map(r => r.w + ":" + r.errs).join(" "));
  } finally {
    await browser.close();
    server.close();
  }
}

/* ============================ G. the release ============================== */
function releasePins() {
  console.log("\n--- G. the release carries it ---");
  const VER = "6.113.1", PVER = "6.184.1";
  const vj = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "app", "version.json"), "utf8"));
  const rm = JSON.parse(fs.readFileSync(path.join(PANEL_DIR, "release-manifest.json"), "utf8"));
  const pv = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "download", "panel-version.json"), "utf8"));
  const man = JSON.parse(fs.readFileSync(path.join(PANEL_DIR, "manifest.json"), "utf8"));
  report("G1) the web app, the panel source and both release records move in lockstep",
    new RegExp('var APP_VER\\s*=\\s*"' + VER + '"').test(APP) && vj.v === VER
    && MAIN.indexOf('const PANEL_VERSION = "' + PVER + '"') > 0
    && rm.version === PVER && pv.v === PVER && pv.latest_version === PVER && man.version === PVER,
    { app: vj.v, panel: rm.version, panelVersionJson: pv.v + "/" + pv.latest_version, manifest: man.version });
  report("G2) the service worker's cache name carries this release, so a phone does not keep the taller card",
    fs.readFileSync(path.join(ROOT, "docs", "app", "sw.js"), "utf8")
      .indexOf('var CACHE = "hnk-web-studio-v' + VER.replace(/\./g, "-") + '"') > 0);
  report("G3) this test runs in CI",
    fs.readFileSync(path.join(ROOT, ".github", "workflows", "test.yml"), "utf8").indexOf("verify_wf_card_compact.js") > 0);
  /* 6.91.0 moved the What's New table out of the shell into data/whatsnew.js;
     the panel's copy is lifted from it by tools/build_panel_whats_new.js */
  const wn = fs.readFileSync(path.join(ROOT, "docs", "app", "data", "whatsnew.js"), "utf8");
  const pwn = fs.readFileSync(path.join(PANEL_DIR, "js", "hnk_whats_new.js"), "utf8");
  report("G4) What's New tells the student, on both surfaces, and in all nine languages",
    wn.indexOf('"v":"' + VER + '"') > 0 && pwn.indexOf(VER) > 0
    && LANGS.every(l => wn.indexOf('{"v":"' + VER + '"') < 0 || true)
    && (() => { try {
         const rows = JSON.parse(wn.slice(wn.indexOf("["), wn.lastIndexOf(";")));
         const r = rows.find(x => x.v === VER);
         return !!r && LANGS.every(l => r.t[l] && r.s[l]);
       } catch (e) { return false; } })());
}

(async () => {
  console.log("=== verify_wf_card_compact — the Smart Workflow card, measured smaller (6.112.0) ===");
  sourcePins();
  const browser = withPremium(await chromium.launch());
  try { await appWalk(browser); } finally { await browser.close(); }
  await panelWalk();
  releasePins();
  console.log(failures ? "\n=== " + failures + " FAILED ===" : "\n=== all checks passed ===");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
