/* ============================================================
   HNK — panel self-test (v6.107.0)

   The owner installed 6.106.0 in real Photoshop and photographed blank card
   art, empty pickers and labels that had lost their text. Driven in a browser
   with UXP's require/uxp/photoshop stubbed, the same build walks all fourteen
   pages with ZERO page errors and every list populated (188 video models, 37
   video tools, 194 workflows, 49 text-to-image models), so the defects belong
   to the renderer, not to the panel's data — and a browser cannot reproduce
   them. Guessing was the only tool left.

   This file removes the guessing. It loads FIRST, before every other script,
   installs the error hooks while there is still something left to catch, and
   publishes what it collected to a card the student (or the owner) can simply
   photograph: which modules arrived, how long each list is, how many pictures
   loaded or failed, what this renderer can actually do, and the first errors
   with their file and line.

   It must be its own file: UXP does not execute inline <script> blocks. It
   must stay dependency-free for the same reason it is first — nothing it
   needs has loaded yet.
   ============================================================ */
(function () {
"use strict";

var MAX_ERRORS = 12;
var errors = [];
var started = Date.now();

function push(kind, message, source, line, col) {
  if (errors.length >= MAX_ERRORS) return;
  var msg = String(message == null ? "" : message).slice(0, 220);
  var src = String(source == null ? "" : source);
  /* the panel is installed under a long UXP plugin path; only the file name
     tells the reader anything, and only the file name fits a panel column */
  var file = src ? src.split(/[\\/]/).pop().split("?")[0] : "";
  for (var i = 0; i < errors.length; i++) {
    if (errors[i].message === msg && errors[i].file === file && errors[i].line === line) {
      errors[i].count++;
      return;
    }
  }
  errors.push({ kind: kind, message: msg, file: file, line: line | 0, col: col | 0,
    at: Date.now() - started, count: 1 });
}

try {
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("error", function (ev) {
      if (!ev) return;
      /* an <img> or <script> that failed to load reports as an error event on
         the element itself, with no message — exactly the failure the owner
         photographed, so it is worth naming rather than dropping */
      var t = ev.target;
      if (t && t !== window && t.tagName) {
        /* v6.53.0 — the owner's card showed nine of these as a bare "load"
           with nothing beside it, because getAttribute("src") came back empty
           and there was nothing else to say. Name the element every way it can
           be named, so the next photograph identifies WHICH pictures failed
           instead of only how many.
           v6.58.1 — AND THE CLASS COULD NEVER BE PRINTED. This read went
           through .className, and 6.53.0 established that UXP answers null for
           an element with no class attribute — while the gallery sets
           className to "" for an unselected thumbnail, which is falsy too. So
           seven gallery pictures reported as a bare "<img no src>" with
           nothing to identify them by, and the cause took a code read rather
           than the card to find. The class comes off getAttribute now, and alt
           and the parent's id are printed as well, because an element with no
           id and no class still sits somewhere with a name. */
        var who = "";
        try {
          who = (t.getAttribute && t.getAttribute("src")) || t.src || "";
          if (!who) {
            var cls = "";
            try { cls = (t.getAttribute && t.getAttribute("class")) || ""; } catch (e2) { cls = ""; }
            var alt = "";
            try { alt = (t.getAttribute && t.getAttribute("alt")) || ""; } catch (e3) { alt = ""; }
            var par = "";
            try {
              var pn = t.parentNode;
              for (var up = 0; up < 3 && pn && pn.getAttribute; up++) {
                var pid = pn.id || pn.getAttribute("id") || "";
                var pcl = pn.getAttribute("class") || "";
                if (pid) { par = " in #" + pid; break; }
                if (pcl) { par = " in ." + String(pcl).split(/\s+/)[0]; break; }
                pn = pn.parentNode;
              }
            } catch (e4) { par = ""; }
            who = "<" + t.tagName.toLowerCase() +
              (t.id ? " #" + t.id : "") +
              (cls ? " ." + String(cls).split(/\s+/)[0] : "") +
              (alt ? " alt=" + alt.slice(0, 24) : "") +
              par + " no src>";
          }
        } catch (e) { who = ""; }
        push("load", t.tagName.toLowerCase() + " failed to load", who, 0, 0);
        return;
      }
      push("error", ev.message || String(ev.error || "error"), ev.filename, ev.lineno, ev.colno);
    }, true);
    window.addEventListener("unhandledrejection", function (ev) {
      var r = ev && ev.reason;
      push("promise", (r && r.message) || String(r || "rejected"),
        (r && r.fileName) || "", (r && r.lineNumber) | 0, 0);
    });
  }
} catch (e) { /* a renderer without listeners still gets the module below */ }

/* ---- what this renderer can actually do -------------------------------
   Every probe below is a measurement, not a version sniff: the panel has no
   reliable way to ask UXP what it supports, and the answers differ between
   Photoshop builds. Each one is cheap, runs off-screen and is taken once. */
var caps = null;
function capabilities() {
  if (caps) return caps;
  caps = {};
  var doc = (typeof document !== "undefined") ? document : null;
  if (!doc) return caps;

  /* A. does <select>.options see an <option> nested in an <optgroup>?
        vidModel is the panel's only picker built that way (41 groups, no
        direct option children), and it is the picker the owner saw empty. */
  try {
    var sel = doc.createElement("select");
    var og = doc.createElement("optgroup");
    og.label = "g";
    var o = doc.createElement("option");
    o.value = "v"; o.text = "v"; o.textContent = "v";
    og.appendChild(o); sel.appendChild(og);
    caps.optgroup = !!(sel.options && sel.options.length === 1);
  } catch (e) { caps.optgroup = false; }

  /* B. does Range.getClientRects() return LINE BOXES (a handful) or one box
        per character? fitBtnIn() splits a wrapped button label on that
        measurement, and a per-character answer chops the label after one
        letter — the shape of the owner's overlapping Home text. */
  var probe = null;
  try {
    probe = doc.createElement("div");
    probe.style.position = "absolute"; probe.style.left = "-9999px";
    probe.style.top = "0"; probe.style.width = "40px"; probe.style.fontSize = "12px";
    var text = "abcdefghij klmnopqrst uvwxyzabcd";
    var tn = doc.createTextNode(text);
    probe.appendChild(tn);
    (doc.body || doc.documentElement).appendChild(probe);
    var rg = doc.createRange();
    rg.selectNodeContents(tn);
    var rects = rg.getClientRects ? rg.getClientRects() : null;
    var n = 0;
    for (var i = 0; rects && i < rects.length; i++) if (rects[i].width > 0.5) n++;
    caps.rangeRects = n;
    caps.rangeLineBoxes = n > 0 && n < text.length / 2;
  } catch (e2) {
    /* -1: the probe could not run at all. The owner's Photoshop answers this
       way — document.createRange is not there — which is a different fact
       from "one box per glyph", and the card says which. */
    caps.rangeRects = -1; caps.rangeLineBoxes = false;
  }
  /* v6.107.1 — the probe div used to be removed only on the success path, so
     the renderer that throws here (the owner's) kept a stray off-screen node */
  try { if (probe && probe.parentNode) probe.parentNode.removeChild(probe); } catch (e4) { }

  /* C. can this renderer draw an SVG file in <img>? The whole icon set is
        SVG, so a "no" here would explain a great deal at a glance.

     v6.132.0 — AND IT NEVER ANSWERED, FOR TWO YEARS OF BUILDS. The probe
     created the <img>, set .src and never put it IN THE DOCUMENT. UXP does
     not load a detached image — that is the same fact 6.128.0 and 6.129.0
     were about — so neither onload nor onerror ever fired and the row read
     "pending" forever. The owner photographed it that way on 6.107.0 and
     again on 6.131.0; 6.107.1 moved WHEN the probe starts and never noticed
     that it could not finish. The line-box probe directly above appends its
     node. This one now does too, and takes it away again on the answer.

     NOTHING CHECKS THE CHECKER — that is why a broken diagnostic survived
     five waves of diagnostics.

     v6.63.0 — AND WHEN IT FINALLY ANSWERED, IT ANSWERED WRONG. 6.132.0 fixed
     the probe so it could resolve, 6.133.0's card read "SVG in img: no", and
     the SAME PHOTOGRAPH shows two SVGs plainly drawn two rows below it in the
     stroke-vs-fill row. Both cannot be true. The probe judged on
     `naturalWidth > 0`, and UXP reports no intrinsic width for an SVG it is
     perfectly willing to paint — so "no" meant "this renderer does not tell me
     the size", never "this renderer cannot draw it".

     The row is now two facts, each judged on what actually matters:
       · icon (png)  — does the file the panel now ships for every icon load?
                       That is the only one the UI depends on.
       · svg         — does the old SVG load? Kept because the answer is
                       interesting, but judged on onload/onerror alone; the
                       intrinsic size is never consulted again.
     The stroke-vs-fill row below remains the real evidence for both: two
     pictures, at panel size, that a photograph can settle. */
  caps.iconPng = "pending";
  caps.svgImg = "pending";
  var probeImg = function (src, set) {
    try {
      var im = doc.createElement("img");
      im.style.position = "absolute"; im.style.left = "-9999px"; im.style.top = "0";
      im.style.width = "16px"; im.style.height = "16px";
      var done = function (v) {
        set(v);
        try { if (im.parentNode) im.parentNode.removeChild(im); } catch (e5) { }
      };
      /* onload IS the answer. naturalWidth is not consulted: that is the
         mistake this probe made for a whole release. */
      im.onload = function () { done("yes"); };
      im.onerror = function () { done("no"); };
      (doc.body || doc.documentElement).appendChild(im);
      im.src = src;
    } catch (e3) { set("no"); }
  };
  probeImg("icons/ui/i-home-muted.png", function (v) { caps.iconPng = v; });
  probeImg("icons/ui/i-home-muted.svg", function (v) { caps.svgImg = v; });

  /* D. v6.132.0 — CAN A <select> BE SET AT ALL? Twenty of them carry the
        panel's pickers (model, language, ratio, count, size) and the owner
        reports every one of them unselectable. Reading options already works
        (A above), so this asks the next question: does assigning
        selectedIndex stick, and does the widget report the value back. It
        cannot ask whether the DROPDOWN OPENS — no script can — but a "no"
        here would settle it without a photograph. */
  try {
    var s2 = doc.createElement("select");
    s2.style.position = "absolute"; s2.style.left = "-9999px"; s2.style.top = "0";
    var oA = doc.createElement("option"); oA.value = "a"; oA.text = "a"; oA.textContent = "a";
    var oB = doc.createElement("option"); oB.value = "b"; oB.text = "b"; oB.textContent = "b";
    s2.appendChild(oA); s2.appendChild(oB);
    (doc.body || doc.documentElement).appendChild(s2);
    s2.selectedIndex = 1;
    var got = (s2.value === "b" && s2.selectedIndex === 1);
    caps.selectSet = got ? "yes" : "no";
    try { if (s2.parentNode) s2.parentNode.removeChild(s2); } catch (e6) { }
  } catch (e7) { caps.selectSet = "no"; }

  /* E. v6.132.0 — how tall is this panel, really? "panel အရမ်းရှည်" is a
        measurement, not an opinion, and the renderer is the only place it
        can be taken. */
  try {
    var de = doc.documentElement;
    caps.viewW = de ? de.clientWidth : 0;
    caps.viewH = de ? de.clientHeight : 0;
    caps.docH = (doc.body && doc.body.scrollHeight) || (de && de.scrollHeight) || 0;
  } catch (e8) { }

  /* F+G. v6.65.0 — THE RULER, THIRD ATTEMPT, AND THIS TIME THE FAILURE IS
     NAMED RATHER THAN GUESSED AT.

     THE PROOF, from the owner's photographs of panel 6.135.0:

         glyph ruler    notdef 0 · n 0

     That row measures the advance width of the letter "n". A font that cannot
     draw "n" does not exist. The reading is not about fonts at all:
     getBoundingClientRect() hands back an ALL-ZERO rect in this renderer for a
     node the panel has just created. box-sizing 0px, flex gap 0px and calc()
     NO are the same one fact, reported three times.

     AND ONE OF MY OWN ROWS WAS A FALSE POSITIVE THE WHOLE TIME. "position:
     fixed  yes" was decided by `Math.abs(r.top) <= 1 && Math.abs(r.left) <= 1`
     — which an all-zero rect satisfies perfectly. It never proved that fixed
     positioning works; it proved that the rect was zero, and I read it as the
     one probe that was working and moved the others to match it. Twice now the
     instrument has been the broken thing, and twice I have believed a number
     that only meant "no measurement".

     TWO CHANGES, both about WHEN and about WHAT COUNTS AS AN ANSWER:

       WHEN. Everything used to be built, measured and removed inside one
       synchronous turn. A browser forces a layout when you ask for a rect;
       this renderer evidently does not, so every measurement was taken before
       anything had been laid out. The boxes are built now, left in the
       document, and measured on a later frame (two animation frames, with a
       timer as the fallback), then removed.

       WHAT COUNTS. `rect()` returns null for an all-zero rect instead of a
       number, so a probe that cannot measure says "unmeasurable" and NOTHING
       ELSE. position:fixed is decided at top:12px left:7px rather than at the
       origin, so zeros can no longer masquerade as a pass.

     If the card still reads "unmeasurable" after this, that is a real answer:
     this renderer does not expose geometry to script at all, and every layout
     question has to be settled by photograph. It will not be a broken ruler
     reported as a fact. */
  function box(doc2, css) {
    var d = doc2.createElement("div");
    for (var k in css) if (css.hasOwnProperty(k)) { try { d.style[k] = css[k]; } catch (e) { } }
    return d;
  }
  caps.cssBox = "pending"; caps.cssGap = "pending"; caps.cssCalc = "pending";
  caps.cssFixed = "pending"; caps.glyphMiss = "pending";
  try {
    var host = box(doc, { width: "200px", height: "120px" });
    host.style.position = "fixed"; host.style.top = "0"; host.style.left = "0";
    host.style.opacity = "0"; host.style.overflow = "hidden";
    (doc.body || doc.documentElement).appendChild(host);

    /* F1 — is the box-model reset in force? 100px wide, 10px padding, 1px
       border: border-box measures 100, content-box measures 122. A "no" here
       means every padded box in the panel is 22px wider than its rule says. */
    var b1 = box(doc, { width: "100px", padding: "10px", border: "1px solid #000" });
    host.appendChild(b1);

    /* F2 — flex gap. Two 10px children in a row with gap:20px: the second
       starts 30 from the first if gap is honoured, 10 if it is dropped. */
    var f2 = box(doc, { display: "flex", flexDirection: "row", width: "180px" });
    try { f2.style.gap = "20px"; } catch (e) { }
    var c1 = box(doc, { width: "10px", height: "10px" });
    var c2 = box(doc, { width: "10px", height: "10px" });
    f2.appendChild(c1); f2.appendChild(c2); host.appendChild(f2);

    /* F3 — calc(). #pageAiTools already ships a plain percentage before every
       calc() width, which is the shape of a codebase that suspected this. */
    var b3 = box(doc, { width: "calc(50px + 10px)", height: "10px" });
    host.appendChild(b3);

    /* F4 — position:fixed, at 12/7 and NOT at the origin. The toast, the
       Freeform sheet and the video wizard sheet are all fixed; if it degrades
       to static they land in the flow, and the rect then reports the flow
       position rather than 12/7. Zeros fail this, which is the whole point. */
    var b4 = box(doc, { position: "fixed", top: "12px", left: "7px", width: "8px", height: "8px" });
    host.appendChild(b4);

    /* F5/F6 — read-backs, which need no layout and can be taken now. Weaker
       evidence (a renderer may store a property it does not honour) but a
       blank read-back is conclusive the other way. */
    var b5 = box(doc, {});
    try { b5.style.objectFit = "cover"; } catch (e) { }
    caps.cssObjectFit = (b5.style && b5.style.objectFit === "cover") ? "kept" : "DROPPED";
    var b6 = box(doc, {});
    try { b6.style.backgroundSize = "cover"; } catch (e) { }
    caps.cssBgSize = (b6.style && b6.style.backgroundSize === "cover") ? "kept" : "DROPPED";

    /* G — WHICH SYMBOLS DOES THIS FONT ACTUALLY HAVE?

       Every character a font is missing is drawn as `.notdef`, and every
       .notdef has the same advance width, so a private-use codepoint no font
       maps supplies that width to compare against. The card ALSO draws the
       whole strip, and on 6.135.0 the picture answered what this arithmetic
       could not: U+27A1 and U+1F504 come back as boxes, everything else draws,
       several of them in colour. The measurement stays because it can cover
       characters the strip has no room for — but it is the second witness
       now, not the first. */
    var GLYPH_CP = [
      0x2192, 0x2713, 0x2190, 0x25B8, 0x2715, 0x26A0, 0x270E, 0x21BA,
      0x2605, 0x25B6, 0x2665, 0x2B07, 0x25BE, 0x25C0, 0x27A1, 0x22EE,
      0x2B06, 0x2295, 0x2726, 0x25B4, 0x21C4, 0x2194, 0x267B, 0x26D3,
      0x2717, 0x27F3, 0x25C9, 0x2248, 0x2264, 0x263D,
      0x1F504, 0x2B50, 0x1F4CC, 0x26A1, 0x1F4BE, 0x1F558
    ];
    var chOf = function (cp) {
      if (cp < 0x10000) return String.fromCharCode(cp);
      var v = cp - 0x10000;
      return String.fromCharCode(0xD800 + (v >> 10), 0xDC00 + (v & 0x3FF));
    };
    var GLYPHS = [];
    for (var gc = 0; gc < GLYPH_CP.length; gc++) GLYPHS.push(chOf(GLYPH_CP[gc]));
    caps.glyphList = GLYPHS;
    var gs = doc.createElement("span");
    gs.style.fontSize = "64px";
    gs.style.whiteSpace = "pre";
    gs.appendChild(doc.createTextNode("n"));
    host.appendChild(gs);

    /* ---- the measurement, taken once a frame has been laid out ---- */
    /* an all-zero rect is NOT a zero-sized box; it is a box that was never
       laid out. Saying so is the correction this whole section is about. */
    var rect = function (el) {
      try {
        var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        if (!r) return null;
        if (!r.width && !r.height && !r.top && !r.left) return null;
        return r;
      } catch (e) { return null; }
    };
    var measured = false;
    var measure = function () {
      if (measured) return;
      measured = true;
      try {
        var r1 = rect(b1);
        caps.cssBox = !r1 ? "unmeasurable"
          : (Math.abs(r1.width - 100) <= 1) ? "border-box"
          : (Math.abs(r1.width - 122) <= 2) ? "content-box"
          : (Math.round(r1.width) + "px");

        var rc1 = rect(c1), rc2 = rect(c2);
        var d2 = (rc1 && rc2) ? (rc2.left - rc1.left) : -1;
        caps.cssGap = (!rc1 || !rc2) ? "unmeasurable"
          : (d2 >= 28 && d2 <= 32) ? "yes"
          : (d2 >= 9 && d2 <= 11) ? "NO"
          : (Math.round(d2) + "px");

        var r3 = rect(b3);
        caps.cssCalc = !r3 ? "unmeasurable"
          : (Math.abs(r3.width - 60) <= 1) ? "yes"
          : (Math.round(r3.width) + "px");

        var r4 = rect(b4);
        caps.cssFixed = !r4 ? "unmeasurable"
          : ((Math.abs(r4.top - 12) <= 1 && Math.abs(r4.left - 7) <= 1) ? "yes"
            : (Math.round(r4.left) + "," + Math.round(r4.top)));

        /* the glyph ruler, on the same laid-out frame */
        var gw = function (ch) {
          while (gs.firstChild) gs.removeChild(gs.firstChild);
          gs.appendChild(doc.createTextNode(ch));
          var r = rect(gs);
          return r ? r.width : -1;
        };
        var have = gw("n");
        var miss = gw(chOf(0xE0FF));   /* private use: nothing maps it */
        caps.glyphRef = "notdef " + Math.round(miss) + " · n " + Math.round(have);
        if (!(miss > 0) || !(have > 0)) caps.glyphMiss = "unmeasurable";
        else if (Math.abs(miss - have) <= 0.5) caps.glyphMiss = "indistinguishable";
        else {
          var gone = [];
          for (var gi = 0; gi < GLYPHS.length; gi++) {
            var w = gw(GLYPHS[gi]);
            if (w >= 0 && Math.abs(w - miss) <= 0.5) gone.push(GLYPH_CP[gi].toString(16).toUpperCase());
          }
          caps.glyphMiss = gone.length ? gone.join(" ") : "none";
          caps.glyphN = gone.length + "/" + GLYPHS.length;
        }
      } catch (eM) {
        caps.cssBox = "unmeasurable"; caps.cssGap = "unmeasurable";
        caps.cssCalc = "unmeasurable"; caps.cssFixed = "unmeasurable";
        caps.glyphMiss = "unmeasurable";
      }
      try { if (host.parentNode) host.parentNode.removeChild(host); } catch (e) { }
    };
    /* two frames, because the first one may be the frame the nodes were added
       in; a timer behind it in case this shell has no rAF at all */
    var raf = (typeof requestAnimationFrame === "function") ? requestAnimationFrame : null;
    if (raf) raf(function () { raf(measure); });
    if (typeof setTimeout === "function") setTimeout(measure, 120);
    else if (!raf) measure();
  } catch (e9) {
    caps.glyphMiss = caps.glyphMiss === "pending" ? "?" : caps.glyphMiss;
    caps.cssBox = caps.cssBox === "pending" ? "?" : caps.cssBox;
    caps.cssGap = caps.cssGap === "pending" ? "?" : caps.cssGap;
    caps.cssCalc = caps.cssCalc === "pending" ? "?" : caps.cssCalc;
    caps.cssFixed = caps.cssFixed === "pending" ? "?" : caps.cssFixed;
    caps.cssObjectFit = caps.cssObjectFit || "?"; caps.cssBgSize = caps.cssBgSize || "?";
  }

  return caps;
}

/* v6.132.0 — DOES A TAP EVEN ARRIVE?

   Wiring reads "60 ok · 0 failed" and the owner cannot press a single
   control. Those two facts are not in conflict: binding a listener proves the
   bind ran, never that an event reaches it. So this counts events at the
   DOCUMENT, in the capture phase, before any handler can stop them, and
   remembers what was under the last one.

   Read the row after tapping five things:
     taps 5 -> the events arrive; the fault is the handler or the widget
     taps 0 -> nothing reaches the document at all; the fault is the shell
   Either answer removes half the search space, which is the whole job of a
   diagnostic. */
var taps = 0, lastTap = "";
function describe(el) {
  try {
    if (!el || !el.tagName) return "?";
    var t = String(el.tagName).toLowerCase();
    if (el.id) return t + "#" + el.id;
    var c = el.className;
    /* className is null on some UXP nodes (6.53.0) — never assume a string */
    c = (typeof c === "string" && c) ? ("." + c.split(/\s+/)[0]) : "";
    return t + c;
  } catch (e) { return "?"; }
}
try {
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("click", function (ev) {
      taps++;
      lastTap = describe(ev && (ev.target || ev.srcElement));
    }, true);
  }
} catch (e) { }

/* v6.107.1 — start the SVG probe at LOAD, not at first render. The owner's
   first SELF-TEST photograph read "SVG in img  pending": capabilities() had
   only just kicked the image off, and an <img> resolves a frame or two later,
   so the card showed the state of a question it had asked a moment earlier.
   The answer lands on the same caps object either way (capabilities() returns
   the cached one, and the handlers below mutate it), so pressing Run again
   would have shown it — but a diagnostic should be right the first time. */
try {
  if (typeof document !== "undefined" && document.createElement) capabilities();
} catch (e) { }

var API = {
  errors: function () { return errors.slice(); },
  errorCount: function () { return errors.length; },
  note: function (message, source) { push("note", message, source || "", 0, 0); },
  capabilities: capabilities,
  taps: function () { return { count: taps, last: lastTap }; }
};

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.selfTest = API; }
})();
