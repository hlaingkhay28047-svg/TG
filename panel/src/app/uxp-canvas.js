/* ============================================================
   HNK Photoshop Panel — canvas state where the host has none (v6.134.0 / panel 6.205.0)

   WHY THIS FILE EXISTS. The owner opened the Album page in Photoshop 27.10.0
   and photographed the panel's own error line:

       album:draw x.save is not a function @ hnk_album.js:4250

   Line 4250 is the first statement of drawLook(), the function that paints the
   paper a standee page stands on. Adobe's UXP renderer gives a <canvas> a 2D
   context that draws — fillRect, fillText, drawImage all work, the panel has
   been drawing icons and previews with them since 6.135.0 — but that context
   has no save() and no restore(). In a browser those two are so ordinary that
   the web app's Album module uses them twenty times and Imagine once more, and
   nobody had ever asked whether the host had them. It does not, so the whole
   page-stage draw died on its first line and the student saw a stage that
   never painted.

   THE FIX IS ONE SHIM, NOT TWENTY-ONE EDITS — and, unlike an edit, it also
   covers the twenty-second the next lift brings in. This script runs first and
   wraps the canvas element's getContext, so every 2D context the panel ever
   makes comes back able to save and restore.

   IN A BROWSER IT DOES NOTHING. If the probe context already has save and
   restore as functions — every browser, and the Chromium the tests drive — the
   shim installs nothing at all and every existing test keeps its meaning. It
   still MEASURES the context, so the SELF-TEST "Canvas" row prints the truth on
   whichever host the panel is running in.

   HOW save/restore ARE IMPLEMENTED, AND WHY IT IS EXACT.

   A 2D save() snapshots two things the panel uses: the drawing properties, and
   the transform. The properties are easy — read them, put them back.

   The transform is the interesting one, because a host with no save() may also
   have no setTransform() to reset with, and this shim must not assume it does.
   So instead of tracking an absolute matrix it keeps an UNDO LOG: every
   translate / rotate / scale made since the last save() is recorded as its own
   inverse, and restore() replays those inverses in reverse order. That is
   exactly correct, not an approximation, because canvas transform operations
   POST-multiply:

       after  translate(10,0) then rotate(a):   M = T(10)·R(a)
       undo   rotate(-a) then translate(-10,0): M·R(-a)·T(-10)
                                               = T(10)·R(a)·R(-a)·T(-10) = I

   and it needs only the three primitives the code already calls. A scale by
   zero cannot be inverted; it is skipped and counted, and the SELF-TEST row
   says so rather than the panel silently drawing in the wrong place. The panel
   makes no such call today — the count is there so that if one ever appears it
   is reported instead of hidden.

   THE PATH IS NOT TOUCHED, which is right: in a real 2D context save() and
   restore() do not save or restore the current path either.

   TWO MORE METHODS GET A FALLBACK, BOTH DECLARED.
     · ellipse() — four call sites (the book-view shadows). Where the host has
       none it is built from translate + scale + arc, which is the identity
       every renderer draws an ellipse with. Exact, not a degradation.
     · setLineDash() — seven call sites. Where the host has none the line is
       drawn SOLID instead of dashed. That is a visible difference, so it is
       named in the SELF-TEST row rather than passed off as a fix; a solid
       guide line is worth having and a thrown TypeError is not.

   EVERYTHING ELSE THE PANEL USES IS MEASURED, NOT FAKED. The two lists below
   are every 2D-context member the panel's own code calls or sets, taken from a
   scan of panel/**.js. Anything in them the host lacks is NAMED by the
   SELF-TEST "Canvas" row and left missing — a no-op that swallows a draw would
   turn a visible crash into an invisible blank, which is the trade this studio
   does not make.
   ============================================================ */
(function () {
  "use strict";
  var G = (typeof globalThis !== "undefined") ? globalThis : window;
  G.HNK = G.HNK || {};

  /* every 2D-context method the panel calls (scan of panel/**.js, 6.134.0) */
  var USED_METHODS = ["save", "restore", "beginPath", "closePath", "moveTo", "lineTo", "rect",
    "arc", "ellipse", "fill", "stroke", "fillRect", "strokeRect", "clearRect", "fillText",
    "measureText", "drawImage", "getImageData", "putImageData", "createImageData",
    "createLinearGradient", "translate", "rotate", "scale", "setLineDash"];
  /* every 2D-context property the panel assigns — the state save() must keep */
  var STATE_PROPS = ["fillStyle", "strokeStyle", "lineWidth", "font", "globalAlpha",
    "textAlign", "textBaseline", "globalCompositeOperation", "filter",
    "imageSmoothingEnabled", "lineCap", "lineJoin"];

  var report = {
    checked: false,      /* a context has been measured */
    native: null,        /* true when the host's own context has save + restore */
    installed: 0,        /* contexts this shim has fitted */
    missing: [],         /* members of USED_METHODS the host does not have */
    props: [],           /* members of STATE_PROPS the host does not have */
    fallbacks: [],       /* what the shim supplies in their place */
    dropped: 0,          /* transform ops that could not be inverted (scale by 0) */
    err: ""              /* a refusal, if measuring itself failed */
  };
  G.HNK.canvasShim = report;

  function has(ctx, name) { try { return typeof ctx[name] === "function"; } catch (e) { return false; } }
  function hasProp(ctx, name) { try { return (name in ctx); } catch (e) { return false; } }

  /* ---- the state stack, fitted to one context ---- */
  function fit(ctx) {
    if (!ctx || ctx.__hnkCanvasState) return ctx;
    try { Object.defineProperty(ctx, "__hnkCanvasState", { value: true, enumerable: false }); }
    catch (e) { try { ctx.__hnkCanvasState = true; } catch (e2) { return ctx; } }

    var stack = [];
    var live = STATE_PROPS.filter(function (p) { return hasProp(ctx, p); });
    var replaying = false;                               /* restore()'s own inverse calls are not new work */

    /* the transform undo log — one list per open save() level */
    function note(op) { if (!replaying && stack.length) stack[stack.length - 1].undo.push(op); }
    function wrapT(name, inverse) {
      var orig = ctx[name];
      if (typeof orig !== "function") return;
      ctx[name] = function () {
        var out = orig.apply(ctx, arguments);
        var inv = inverse.apply(null, arguments);
        if (inv) note(inv); else report.dropped++;
        return out;
      };
    }
    wrapT("translate", function (x, y) { return ["translate", -(x || 0), -(y || 0)]; });
    wrapT("rotate", function (a) { return ["rotate", -(a || 0)]; });
    wrapT("scale", function (sx, sy) {
      if (!sx || !sy) return null;                      /* a zero scale cannot be undone; counted, never guessed */
      return ["scale", 1 / sx, 1 / sy];
    });

    /* the dash pattern rides with the state; where the host has no setLineDash
       the call is recorded and the line stays solid (named in the row) */
    var dash = [];
    if (has(ctx, "setLineDash")) {
      var origDash = ctx.setLineDash;
      ctx.setLineDash = function (a) { dash = (a && a.slice) ? a.slice() : []; return origDash.call(ctx, a); };
    } else {
      ctx.setLineDash = function (a) { dash = (a && a.slice) ? a.slice() : []; };
    }

    ctx.save = function () {
      var props = {};
      for (var i = 0; i < live.length; i++) { try { props[live[i]] = ctx[live[i]]; } catch (e) { } }
      stack.push({ props: props, undo: [], dash: dash.slice() });
    };
    ctx.restore = function () {
      var lv = stack.pop();
      if (!lv) return;                                   /* an unmatched restore is a no-op, as in a real context */
      var i, op;
      replaying = true;
      for (i = lv.undo.length - 1; i >= 0; i--) {        /* reverse order: the ops post-multiply */
        op = lv.undo[i];
        try {
          if (op[0] === "translate") ctx.translate(op[1], op[2]);
          else if (op[0] === "rotate") ctx.rotate(op[1]);
          else if (op[0] === "scale") ctx.scale(op[1], op[2]);
        } catch (e) { }
      }
      replaying = false;
      for (i = 0; i < live.length; i++) { try { ctx[live[i]] = lv.props[live[i]]; } catch (e) { } }
      dash = lv.dash;
      try { ctx.setLineDash(dash); } catch (e) { }
    };

    /* ellipse from translate + scale + arc — the identity every renderer uses */
    if (!has(ctx, "ellipse") && has(ctx, "arc")) {
      ctx.ellipse = function (cx, cy, rx, ry, rot, a0, a1, ccw) {
        if (!rx || !ry) return;
        ctx.save();
        ctx.translate(cx, cy);
        if (rot) ctx.rotate(rot);
        ctx.scale(rx, ry);
        ctx.arc(0, 0, 1, a0, a1, !!ccw);
        ctx.restore();
      };
    }
    report.installed++;
    return ctx;
  }

  /* ---- measure one context, then decide ---- */
  function measure(ctx) {
    if (report.checked || !ctx) return;
    report.checked = true;
    report.missing = USED_METHODS.filter(function (m) { return !has(ctx, m); });
    report.props = STATE_PROPS.filter(function (p) { return !hasProp(ctx, p); });
    report.native = has(ctx, "save") && has(ctx, "restore");
    if (!report.native) {
      report.fallbacks.push("save/restore");
      if (!has(ctx, "ellipse") && has(ctx, "arc")) report.fallbacks.push("ellipse (translate+scale+arc)");
      if (!has(ctx, "setLineDash")) report.fallbacks.push("setLineDash (lines draw solid)");
    }
  }

  /* ---- wrap getContext wherever it lives on the canvas element ---- */
  function install() {
    var probe = null, ctx = null;
    try { probe = document.createElement("canvas"); probe.width = probe.height = 2; } catch (e) { report.err = "no canvas element — " + String((e && e.message) || e).slice(0, 80); return; }
    if (!probe || typeof probe.getContext !== "function") { report.err = "the canvas element has no getContext"; return; }
    try { ctx = probe.getContext("2d"); } catch (e) { ctx = null; }
    if (!ctx) { report.err = "getContext(\"2d\") answered nothing"; return; }
    measure(ctx);
    if (report.native) return;                            /* a browser: nothing to do, and nothing done */

    /* find the object that actually carries getContext, so the wrap catches every canvas */
    var owner = probe;
    while (owner && !Object.prototype.hasOwnProperty.call(owner, "getContext")) owner = Object.getPrototypeOf(owner);
    if (!owner) owner = probe;
    if (owner.__hnkCanvasShim) return;
    var orig = owner.getContext;
    owner.getContext = function (kind) {
      var out = orig.apply(this, arguments);
      if (out && String(kind).toLowerCase() === "2d") { try { fit(out); } catch (e) { } }
      return out;
    };
    try { Object.defineProperty(owner, "__hnkCanvasShim", { value: true, enumerable: false }); }
    catch (e) { owner.__hnkCanvasShim = true; }
    fit(ctx);                                             /* the probe's own context, already handed out */
  }

  /* the test hook: fit a context the caller supplies, and say what was done */
  G.HNK.canvasShim.fit = function (ctx) { measure(ctx); return fit(ctx); };
  G.HNK.canvasShim.line = function () {
    if (report.err) return { level: "err", detail: report.err };
    if (!report.checked) return { level: "pend", detail: "—" };
    if (report.native) {
      var gapN = report.missing.concat(report.props);
      return gapN.length
        ? { level: "warn", detail: "save/restore native · missing " + gapN.join(", ") }
        : { level: "ok", detail: "native · all " + (USED_METHODS.length + STATE_PROPS.length) + " members present" };
    }
    var gap = report.missing.filter(function (m) { return m !== "save" && m !== "restore" && m !== "ellipse" && m !== "setLineDash"; }).concat(report.props);
    var bits = ["host has no save/restore — shim on " + report.installed + " context" + (report.installed === 1 ? "" : "s")];
    if (report.fallbacks.length > 1) bits.push(report.fallbacks.slice(1).join(" · "));
    if (report.dropped) bits.push(report.dropped + " transform op" + (report.dropped === 1 ? "" : "s") + " not restorable");
    if (gap.length) bits.push("STILL MISSING " + gap.join(", "));
    return { level: gap.length ? "err" : "host", detail: bits.join(" · ") };
  };

  try { install(); } catch (e) { report.err = "THREW — " + String((e && e.message) || e).slice(0, 120); }
})();
