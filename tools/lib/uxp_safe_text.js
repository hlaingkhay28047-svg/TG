/* v6.64.0 — THE GLYPH RULE SET, APPLIED WHERE THE TEXT IS LIFTED.

   THE PHOTOGRAPHS. The owner installed panel 6.134.0 and sent sixteen
   pictures. The icon wave had worked — the SELF-TEST card's stroke-vs-fill
   row finally shows a thin outline house beside the gold star — but black
   rounded squares are still scattered through the UI text on Retouch A,
   Retouch B, Path and Recipes.

   Those squares are not icons. They are `.notdef`: the box a font draws when
   it is asked for a character it does not have. Adobe's UXP shell paints the
   panel in the host's UI font, and that font carries no colour emoji.

   WHAT THE SAME PHOTOGRAPHS PROVE IS FINE. The stroke-vs-fill row reads
   "← outline · fill →" with both arrows drawn, and every green ✓ in the card
   is a ✓. So U+2192, U+2190 and U+2713 are present, and a blanket sweep of
   "everything above U+2000" would rewrite 1,131 strings that already work.
   The rule set below is therefore narrow and each entry has a reason.

   WHICH CHARACTERS, AND HOW THEY WERE CHOSEN:

     · every pictograph at U+1F000 and above — no UI font ships these, and
       there is nothing to measure. 🔄 ⭐-adjacent 📌 🎂 🎬 🎓 💾 🕘 🌙 …

     · the BMP characters whose default presentation is emoji, which the
       shell resolves the same way: ⭐ ⚡ ⛅ ⛈ ➿ ⛓.

     · anything carrying U+FE0F. That selector is a request for the emoji
       font by name; where there is no emoji font it is a request for a box.
       (☀️ ☁️ 🌫️ on the Home greeting are all of this shape.)

     · ⚠ U+26A0, WHICH IS A DEDUCTION FROM ONE PHOTOGRAPH, not a guess. The
       Path screen shows black squares. Path's whole non-ASCII inventory is
       — → ⚠ … –, and the same set of photographs shows → drawn correctly
       while — … – are ordinary punctuation the panel uses everywhere. By
       elimination the square on Path is ⚠, and it is the lead character of
       27 of that screen's messages.

   WHAT IS DELIBERATELY NOT HERE: ▸ ✕ ✎ ↺ ★ ▶ ♥ ⬇ ▾ ◀ ➡ ⋮ ⬆ ⊕ ✦ ▴ ⇄ ↔ ♻ ✗
   ⟳ ◉ ≈ ≤ ☽. Nothing photographed says whether this renderer has them, and
   the panel now MEASURES them: panel-selftest.js compares each one's advance
   width against a codepoint no font maps, and the SELF-TEST card prints the
   verdict and draws the whole strip so one picture can check the measurement.
   They join this file when there is an answer, not before. Guessing is what
   the last five waves were made of.

   THREE BEHAVIOURS, the same shape as tools/lib/uxp_safe_css.js:

     REPLACE  a known glyph, by the entry's `word` — almost always "" — with
              the spacing tidied so "⚠ IMAGE 2 is missing" becomes
              "IMAGE 2 is missing" and not " IMAGE 2 is missing".

     KEEP     a glyph on a line that already hands it to a sprite. The app
              writes `…tap 💾 Save`).replace("💾", icn("i-save")) — the 💾 is a
              placeholder that never reaches the screen, and stripping it
              would silently delete the picture instead of the box. The rule
              is the pairing on the line, not a list of line numbers.

     REFUSE   a forbidden glyph this file has no entry for. The web app is
              free to add an emoji; the panel build then stops and names the
              line, and a person decides whether it becomes a sprite, a word
              or nothing. A silently dropped character in a file nobody reads
              is worse than a build that will not finish.

   The web app keeps every emoji it has. It runs in Chromium, where they draw.
   ============================================================ */

"use strict";

/* icon: the panel sprite that should stand in where the surface can carry a
   picture (wired by hand at the render site — a generated string cannot hold
   an <img>). word: what the text itself becomes. */
const GLYPHS = {
  "\u{1F504}": { word: "", icon: "i-retry", note: "🔄 Retry — the button says Retry" },
  "\u{1F4CC}": { word: "", icon: null, note: "📌 in What's New prose — 'Pin a state' reads the same" },
  "\u{1F382}": { word: "", icon: null, note: "🎂 Birthday — the label says Birthday" },
  "\u{1F3AC}": { word: "", icon: "i-clapper", note: "🎬 Scenes Pro" },
  "\u{1F393}": { word: "", icon: "i-books", note: "🎓 Learn mode" },
  "\u{1F4BE}": { word: "", icon: "i-save", note: "💾 Save — kept where a .replace hands it to the sprite" },
  "\u{1F558}": { word: "", icon: "i-clock", note: "🕘 Recent" },
  "\u{1F319}": { word: "", icon: null, note: "🌙 weather — the word beside it is already translated" },
  "\u{1F32B}": { word: "", icon: null, note: "🌫 weather" },
  "\u{1F326}": { word: "", icon: null, note: "🌦 weather" },
  "\u{1F327}": { word: "", icon: null, note: "🌧 weather" },
  "\u{1F328}": { word: "", icon: null, note: "🌨 weather" },
  "⭐": { word: "", icon: "i-star-fill", note: "⭐ Favorites / starred preset" },
  "⚡": { word: "", icon: "i-bolt", note: "⚡ One-shot merge" },
  "⚠": { word: "", icon: "i-warn", note: "⚠ the lead character of every refusal message" },
  "⛅": { word: "", icon: null, note: "⛅ weather" },
  "⛈": { word: "", icon: null, note: "⛈ weather" },
  "⛓": { word: "", icon: "i-link", note: "⛓ chained" },
  "➿": { word: "", icon: null, note: "➿ only ever inside a character class" },
  "☀": { word: "", icon: "i-sun", note: "☀ sun — theme toggle and weather" },
  "☁": { word: "", icon: null, note: "☁ weather" },
};

/* U+FE0F is a request for the emoji font by name. The character it follows
   is forbidden with it, whatever that character is. */
const VS16 = "️";

function isPictograph(cp) { return cp >= 0x1F000; }

/* every forbidden character in `s`, as {ch, cp, index} in source order */
function scan(s) {
  const str = String(s == null ? "" : s);
  const out = [];
  const chars = Array.from(str);
  let index = 0;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const cp = ch.codePointAt(0);
    const next = chars[i + 1];
    if (ch === VS16) { index += ch.length; continue; }
    if (isPictograph(cp) || GLYPHS[ch] || next === VS16) {
      out.push({ ch: ch, cp: cp, index: index, vs16: next === VS16 });
    }
    index += ch.length;
  }
  return out;
}

function hex(cp) { return "U+" + cp.toString(16).toUpperCase().padStart(4, "0"); }

/* ---- REPLACE ----------------------------------------------------------- */
/* ONE ALGORITHM, used by both passes. The glyph goes, and so does the space
   that was only ever separating it from the words: one space AFTER it if
   there is one ("⚠ IMAGE 2 is missing" -> "IMAGE 2 is missing", "…tap 💾
   Save" -> "…tap Save"), otherwise one space BEFORE it.

   It has to be exactly this, and it has to be shared. The first version gave
   uxpSafeText a global collapse-and-trim and uxpSafeCode a local rule, and
   the two disagreed the moment a language does not put spaces around its
   words: the app's Chinese "，⭐ 收藏的预设" came out of one as "，收藏的预设"
   and out of the other as "， 收藏的预设". Nothing was broken by that — but
   test/verify_panel_whats_new.js compares the panel's copy of every release
   note against the app's run through this pass, in nine languages, and a
   one-space disagreement is a failed release. Same function, same answer. */
function stripGlyphs(str, where, keep) {
  const chars = Array.from(str);
  const out = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === VS16) continue;
    const cp = ch.codePointAt(0);
    const forbidden = isPictograph(cp) || !!GLYPHS[ch] || chars[i + 1] === VS16;
    if (!forbidden || (keep && keep[ch])) { out.push(ch); continue; }
    const entry = GLYPHS[ch];
    if (!entry) {
      throw new Error((where || "uxpSafeText") + ": " + hex(cp) + " (" + ch + ") is an emoji this renderer " +
        "has no glyph for, and tools/lib/uxp_safe_text.js has no entry saying what the PANEL should show " +
        "instead. Add one (a word, or a sprite wired at the render site) — the web app keeps its emoji either way.\n" +
        "  in: " + str.slice(0, 160));
    }
    if (entry.word) { out.push(entry.word); continue; }
    let k = i + 1;
    while (k < chars.length && chars[k] === VS16) k++;
    if (chars[k] === " ") { i = k; continue; }
    if (out.length && out[out.length - 1] === " ") out.pop();
  }
  return out.join("");
}

function uxpSafeText(s, where) {
  const str = String(s == null ? "" : s);
  if (!scan(str).length) return str;
  return stripGlyphs(str, where || "uxpSafeText", null);
}

/* ---- the same pass over a captured data structure ---------------------- */
/* The generators lift their translation tables by running the app and
   serialising what it built, so the strings arrive as plain JSON rather than
   as source. Keys are left alone: a key is never drawn. */
function uxpSafeDeep(v, where) {
  if (typeof v === "string") return uxpSafeText(v, where);
  if (Array.isArray(v)) return v.map(function (x) { return uxpSafeDeep(x, where); });
  if (v && typeof v === "object") {
    const out = {};
    for (const k in v) if (Object.prototype.hasOwnProperty.call(v, k)) out[k] = uxpSafeDeep(v[k], where);
    return out;
  }
  return v;
}

/* ---- KEEP: a glyph already handed to a sprite on the same line ---------- */
/* `escH(L9({…"tap 💾 Save"})).replace("💾", icn("i-save"))` — the emoji is a
   marker the app swaps for a picture before anything is painted. The pairing
   is the evidence, so it is what the rule looks for. */
function pairedWithSprite(line, ch) {
  const esc = ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("\\.replace\\(\\s*[\"']" + esc + "[\"']\\s*,\\s*(icn|ffIcon|H\\.icn)\\(").test(line);
}

/* ---- the pass over lifted SOURCE, which may contain both --------------- */
/* THE SPACING IS FIXED AT THE REMOVAL SITE, never by a pass over the line.
   The first version tidied with `.replace(/(["'])[ \t]+/g, "$1")` across the
   whole line, which also ate the space in every innocent `" ("` and `" · "`
   the slice happened to contain — a corruption in generated code that no
   test would have described, because the file still parses. So: take the one
   space the glyph was separating from, and nothing else. */
function uxpSafeCode(code, where) {
  const lines = String(code == null ? "" : code).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hits = scan(line);
    if (!hits.length) continue;
    const keep = {};
    for (const h of hits) if (pairedWithSprite(line, h.ch)) keep[h.ch] = 1;
    if (hits.every(function (h) { return keep[h.ch]; })) continue;
    lines[i] = stripGlyphs(line, (where || "uxpSafeCode") + " line " + (i + 1), keep);
  }
  return lines.join("\n");
}

/* ---- the gate's view: every forbidden glyph, with where it is ---------- */
function findForbidden(text, opts) {
  opts = opts || {};
  const lines = String(text == null ? "" : text).split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    for (const h of scan(lines[i])) {
      if (opts.allowPaired && pairedWithSprite(lines[i], h.ch)) continue;
      out.push({ line: i + 1, ch: h.ch, cp: hex(h.cp), text: lines[i].trim().slice(0, 120) });
    }
  }
  return out;
}

module.exports = {
  GLYPHS: GLYPHS,
  uxpSafeText: uxpSafeText,
  uxpSafeDeep: uxpSafeDeep,
  uxpSafeCode: uxpSafeCode,
  findForbidden: findForbidden,
  pairedWithSprite: pairedWithSprite,
  isPictograph: isPictograph,
  scan: scan,
  hex: hex,
};
