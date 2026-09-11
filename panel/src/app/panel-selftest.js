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

  /* F. v6.62.0 — WHICH OF THE STYLESHEET'S ASSUMPTIONS ARE TRUE HERE?

        styles.css calls itself UXP-SAFE and lists what UXP cannot do, and the
        audit that opened this wave found the file breaking its own list in
        forty-five places: one `*` selector (the box-model reset, the FIRST
        rule in the file), twenty-nine `gap` declarations (the header three
        lines below the list says "UXP has no gap"), nine `object-fit` and six
        `pointer-events`. Every one of those was believed, never measured.

        Four of these are geometry, so they are decided here rather than
        argued: build the case off-screen, read one number back. The other two
        are property read-backs — weaker evidence (a renderer may store a
        property it does not honour) but a blank read-back is conclusive the
        other way. The wave removed all six kinds from the stylesheet, so the
        panel no longer depends on any answer; the card reports them because
        the next question (the nine object-fit thumbs) turns on them. */
  function box(doc2, css) {
    var d = doc2.createElement("div");
    d.style.position = "absolute"; d.style.left = "-9999px"; d.style.top = "0";
    for (var k in css) if (css.hasOwnProperty(k)) { try { d.style[k] = css[k]; } catch (e) { } }
    return d;
  }
  try {
    var host = box(doc, { width: "200px", height: "80px" });
    (doc.body || doc.documentElement).appendChild(host);

    /* v6.63.0 — EVERY MEASUREMENT BELOW READS getBoundingClientRect(), AND
       THAT IS THE WHOLE CORRECTION. 6.62.0 wrote F1-F3 with offsetWidth and
       offsetLeft, and the owner's Photoshop answered `box-sizing 0px`,
       `flex gap 0`, `calc() NO`. None of those was a CSS answer: UXP returns
       0 from offsetWidth and offsetLeft for these nodes, so all three probes
       reported the failure of the ruler rather than the size of the box.
       F4 was the only one that worked, and F4 was the only one that used
       getBoundingClientRect. I built the instrument that was supposed to end
       the guessing and did not check the instrument — the exact mistake this
       panel's SVG probe made for five waves. `w()` is now the only ruler. */
    var w = function (el) {
      try { var r = el.getBoundingClientRect(); return r ? r.width : -1; } catch (e) { return -1; }
    };
    var x = function (el) {
      try { var r = el.getBoundingClientRect(); return r ? r.left : -1; } catch (e) { return -1; }
    };

    /* F1 — is the box-model reset in force? 100px wide, 10px padding, 1px
       border: border-box measures 100, content-box measures 122. A "no" here
       means every padded box in the panel is 22px wider than its rule says,
       which is what a panel that will not fit its column looks like. */
    var b1 = box(doc, { width: "100px", padding: "10px", border: "1px solid #000" });
    host.appendChild(b1);
    var w1 = w(b1);
    caps.cssBox = (w1 < 0) ? "unmeasurable"
      : (Math.abs(w1 - 100) <= 1) ? "border-box"
      : (Math.abs(w1 - 122) <= 2) ? "content-box"
      : (Math.round(w1) + "px");

    /* F2 — flex gap. Two 10px children in a row with gap:20px: the second
       starts 30 from the first if gap is honoured, 10 if it is dropped. */
    var f2 = box(doc, { display: "flex", flexDirection: "row", width: "180px" });
    try { f2.style.gap = "20px"; } catch (e) { }
    var c1 = box(doc, { width: "10px", height: "10px" }); c1.style.position = "static";
    var c2 = box(doc, { width: "10px", height: "10px" }); c2.style.position = "static";
    f2.appendChild(c1); f2.appendChild(c2); host.appendChild(f2);
    var x1 = x(c1), x2 = x(c2), d2 = (x1 < 0 || x2 < 0) ? -1 : (x2 - x1);
    caps.cssGap = (d2 < 0) ? "unmeasurable"
      : (d2 >= 28 && d2 <= 32) ? "yes"
      : (d2 >= 9 && d2 <= 11) ? "NO"
      : (Math.round(d2) + "px");

    /* F3 — calc(). #pageAiTools already ships a plain percentage before every
       calc() width, which is the shape of a codebase that suspected this. */
    var b3 = box(doc, { width: "calc(50px + 10px)", height: "10px" });
    host.appendChild(b3);
    var w3 = w(b3);
    caps.cssCalc = (w3 < 0) ? "unmeasurable"
      : (Math.abs(w3 - 60) <= 1) ? "yes"
      : (w3 > 0) ? (Math.round(w3) + "px") : "NO";

    /* F4 — position:fixed. The toast, the Freeform sheet and the video wizard
       sheet are all fixed; if it degrades to static they land in the flow. */
    var b4 = box(doc, { position: "fixed", top: "0px", left: "0px", width: "8px", height: "8px" });
    host.appendChild(b4);
    var r4 = b4.getBoundingClientRect ? b4.getBoundingClientRect() : null;
    caps.cssFixed = r4 ? ((Math.abs(r4.top) <= 1 && Math.abs(r4.left) <= 1) ? "yes" : "NO") : "?";

    /* F5/F6 — read-backs. object-fit is the one rule this wave did NOT
       remove (nine thumbs across Gallery, Path, the wizard and the Video
       Tools strip), so its answer decides whether that conversion is worth
       three generators of churn. background-size is the substitute the
       stylesheet's own header names, so it is asked in the same breath. */
    var b5 = box(doc, {});
    try { b5.style.objectFit = "cover"; } catch (e) { }
    caps.cssObjectFit = (b5.style && b5.style.objectFit === "cover") ? "kept" : "DROPPED";
    var b6 = box(doc, {});
    try { b6.style.backgroundSize = "cover"; } catch (e) { }
    caps.cssBgSize = (b6.style && b6.style.backgroundSize === "cover") ? "kept" : "DROPPED";

    try { if (host.parentNode) host.parentNode.removeChild(host); } catch (e) { }
  } catch (e9) {
    caps.cssBox = caps.cssBox || "?"; caps.cssGap = caps.cssGap || "?";
    caps.cssCalc = caps.cssCalc || "?"; caps.cssFixed = caps.cssFixed || "?";
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
