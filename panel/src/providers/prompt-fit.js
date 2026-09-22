/* v6.63.0 — what a capped model actually receives, in the app's priority
   order (docs/app/index.html rhTruncatePrompt, ported byte-for-byte;
   test/verify_prompt_fit.js proves the two surfaces cut identically).
   A capped model gets (1) the TASK GUARD block whole whenever it fits at
   all, (2) the OPENING of the task in whatever room is left, cut on a line
   or sentence boundary and never mid-word, and (3) the AVOID list only when
   the whole of it still fits. The adapter used to do a plain slice(0, max),
   which dropped the guard and the AVOID list first and could end on half a
   word; the app kept the guard plus AVOID and could drop the task entirely.
   Now both cut the same way. */
(function (global) {
  "use strict";
  function cutClean(text, n) {
    var s = String(text || "");
    if (!(n > 0)) return "";
    if (s.length <= n) return s;
    var cut = s.slice(0, n), floor = Math.floor(n * 0.6);
    var nl = cut.lastIndexOf("\n");
    if (nl >= floor) return cut.slice(0, nl).replace(/\s+$/, "");
    var i = cut.length - 1;
    while (i >= floor) {
      var c = cut.charAt(i), nx = cut.charAt(i + 1);
      if ((c === "." || c === "!" || c === "?") && (nx === "" || /[\s"”')\]]/.test(nx))) break;
      i--;
    }
    if (i >= floor) return cut.slice(0, i + 1).replace(/\s+$/, "");
    var sp = cut.lastIndexOf(" ");
    if (sp >= floor) return cut.slice(0, sp).replace(/[\s,;:—–-]+$/, "");
    return cut;
  }
  /* v6.66.0 — whole blocks before any character cut, byte-identical to the
     app's rhFitByBlocks (docs/app/index.html). A Smart Workflow prompt is
     written in labelled blocks and a character cut ends mid-block, leaving
     a half-stated instruction — worse than not stating it. */
  var DROP_ORDER = [
    "HAIR:", "SKIN RETOUCH:", "REALISM:", "FINISH:", "SKIN SMOOTHING:",
    /* v6.71.0 — mirrors the app's RH_BLOCK_DROP_ORDER exactly; Studio Look
       Copy's three new blocks drop hairstyle, then ornaments, then makeup,
       because the makeup is what the owner asked for first. */
    "HAIRSTYLE:", "ADORNMENTS:", "MAKEUP COPY:",
    "HAIR RETOUCH:", "COLOUR TONE:", "POSTER ART:", "LIQUIFY:", "DRESS:",
    "EYE & TEETH:", "SHINE CONTROL:", "BODY SKIN:", "TONE EVENING:",
    "DIMENSION:", "SET AND BACKGROUND:", "WARDROBE:", "COLOUR:",
    "SKIN AND DETAIL:", "GARMENT:", "DEPTH & OCCLUSION:", "QUALITY:"
  ];
  var BLOCK_LABEL = /^[A-Z][A-Z0-9 ,&'\/()—-]{1,44}:/;
  function splitBlocks(text) {
    var lines = String(text || "").split("\n"), blocks = [], cur = null;
    lines.forEach(function (ln) {
      if (BLOCK_LABEL.test(ln)) {
        if (cur) blocks.push(cur);
        cur = { tag: ln.slice(0, ln.indexOf(":") + 1), lines: [ln] };
      } else if (cur) { cur.lines.push(ln); }
      else { cur = { tag: "", lines: [ln] }; }
    });
    if (cur) blocks.push(cur);
    return blocks;
  }
  function fitByBlocks(promptText, maxLen) {
    var s = String(promptText || "");
    if (!maxLen || s.length <= maxLen) return { text: s, dropped: [] };
    var tail = "", head = s, ai = s.indexOf("\n\nAVOID:");
    if (ai >= 0) { tail = s.slice(ai); head = s.slice(0, ai); }
    var blocks = splitBlocks(head);
    if (blocks.filter(function (b) { return b.tag; }).length < 3) return { text: s, dropped: [] };
    var dropped = [];
    for (var i = 0; i < DROP_ORDER.length; i++) {
      var joined = blocks.map(function (b) { return b.lines.join("\n"); }).join("\n");
      if ((joined + tail).length <= maxLen) break;
      var tag = DROP_ORDER[i], hit = -1;
      for (var j = 0; j < blocks.length; j++) { if (blocks[j].tag === tag) { hit = j; break; } }
      if (hit < 0) continue;
      blocks.splice(hit, 1); dropped.push(tag);
    }
    return { text: blocks.map(function (b) { return b.lines.join("\n"); }).join("\n") + tail, dropped: dropped };
  }
  /* v6.197.0 — the locks and the AVOID survive the cut, byte-identical to the
     app's rhTruncatePrompt (docs/app/index.html). Measured before the change:
     of the 434 workflow × cap cases the models cut, 65 lost a LOCK line and
     406 lost the AVOID list whole, and a prompt with fewer than three
     labelled blocks never reached fitByBlocks at all. The LOCK lines are now
     lifted out of the body so no character cut can reach them, and an AVOID
     that will not fit whole arrives compact — its lead and as many whole
     items as the room holds. */
  var LOCK_LINE = /^[A-Z][A-Za-z0-9 ,&'\/()—-]{0,60}\bLOCKS?\b[^\n:]{0,40}:/;
  function lockSplit(body) {
    var lines = String(body || "").split("\n"), locks = [], rest = [];
    for (var i = 0; i < lines.length; i++) {
      if (i > 0 && LOCK_LINE.test(lines[i])) locks.push(lines[i]); else rest.push(lines[i]);
    }
    return { locks: locks, rest: rest.join("\n").replace(/\s+$/, "") };
  }
  function keepWhole(lines, budget) {
    var out = [], used = 0;
    for (var i = 0; i < lines.length; i++) {
      var add = lines[i].length + 1;
      if (used + add > budget) break;
      used += add; out.push(lines[i]);
    }
    /* a single lock can be longer than the whole budget; then its OPENING
       arrives, cut clean at a sentence, because a cut lock is an instruction
       and nothing is not */
    if (!out.length && lines.length && budget > 80) {
      var one = cutClean(lines[0], budget - 1);
      if (one) out.push(one);
    }
    return out;
  }
  function avoidFit(avoid, room) {
    var s = String(avoid || "");
    if (!s || !(room > 0)) return "";
    if (s.length <= room) return s;
    var k = s.indexOf("AVOID:");
    if (k < 0) return "";
    var lead = s.slice(0, k + 6) + " ";
    var items = s.slice(k + 6).replace(/^\s+/, "").replace(/\s*\.\s*$/, "").split(/,\s*/);
    var keep = [], used = lead.length + 1;
    for (var i = 0; i < items.length; i++) {
      if (!items[i]) continue;
      var add = (keep.length ? 2 : 0) + items[i].length;
      if (used + add > room) break;
      used += add; keep.push(items[i]);
    }
    if (!keep.length) return "";
    return lead + keep.join(", ") + ".";
  }
  function fit(promptText, maxLen) {
    var s = String(promptText || "");
    if (!maxLen || s.length <= maxLen) return s;
    s = fitByBlocks(s, maxLen).text;
    if (s.length <= maxLen) return s;
    var gi = s.indexOf("TASK GUARD:"), body = s, guard = "", avoid = "", ai;
    if (gi >= 0) {
      body = s.slice(0, gi); var tail = s.slice(gi);
      ai = tail.indexOf("\n\nAVOID:");
      if (ai >= 0) { avoid = tail.slice(ai); tail = tail.slice(0, ai); }
      guard = tail.replace(/\s+$/, "");
    } else {
      ai = s.indexOf("\n\nAVOID:");
      if (ai >= 0) { avoid = s.slice(ai); body = s.slice(0, ai); }
    }
    body = body.replace(/\s+$/, "");
    if (guard) {
      var room0 = maxLen - guard.length - 2;
      if (room0 <= 0) {
        /* the guard alone is bigger than the cap. Only here is it cut, and the
           task still keeps two fifths of the room, so both halves arrive as
           their own opening sentences rather than one arriving as nothing. */
        var h0 = cutClean(body, Math.floor(maxLen * 0.4));
        return (h0 ? h0 + "\n\n" : "") + cutClean(guard, maxLen - (h0 ? h0.length + 2 : 0));
      }
    }
    var room = guard ? maxLen - guard.length - 2 : maxLen;
    var sp = lockSplit(body), lockBytes = 0, i;
    for (i = 0; i < sp.locks.length; i++) lockBytes += sp.locks[i].length + 1;
    var lockRoom = Math.min(lockBytes, Math.floor(room * 0.45));
    var kept = keepWhole(sp.locks, lockRoom);
    var lockText = kept.length ? "\n" + kept.join("\n") : "";
    /* a quarter of the room for the AVOID, never less than 120 characters
       while the room is comfortable — the app's own reserve */
    var avoidRoom = avoid ? Math.min(avoid.length, Math.max(room > 400 ? 120 : 0, Math.floor(room * 0.25))) : 0;
    var head = cutClean(sp.rest, room - lockText.length - avoidRoom);
    var out = (head + lockText).replace(/^\n/, "");
    if (guard) out = (out ? out + "\n\n" : "") + guard;
    return out + avoidFit(avoid, maxLen - out.length);
  }
  global.HNK = global.HNK || {};
  global.HNK.promptFit = { fit: fit, cutClean: cutClean, fitByBlocks: fitByBlocks, avoidFit: avoidFit, lockSplit: lockSplit };
})(typeof globalThis !== "undefined" ? globalThis : this);
