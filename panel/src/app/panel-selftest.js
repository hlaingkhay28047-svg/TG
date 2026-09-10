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
        SVG, so a "no" here would explain a great deal at a glance. */
  caps.svgImg = "pending";
  try {
    var im = doc.createElement("img");
    im.onload = function () { caps.svgImg = im.naturalWidth > 0 ? "yes" : "no"; };
    im.onerror = function () { caps.svgImg = "no"; };
    im.src = "icons/ui/i-home-muted.svg";
  } catch (e3) { caps.svgImg = "no"; }

  return caps;
}

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
  capabilities: capabilities
};

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.selfTest = API; }
})();
