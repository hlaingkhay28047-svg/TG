/* ============================================================================
   HNK — WHITE BALANCE MATCH (6.101.0)

   The owner, after a Selection Edit run: "WB ကော ညီရဲ့ လား တစ်ခါလေမညီလို့"
   — does the white balance match? sometimes it does not.

   It did not, and nothing in the studio was ever measuring it. Every guard we
   had was a SENTENCE: HNK_CORE asks the model for "matched white balance and
   colour", the region prompt asks for "matching white balance and grain
   inside". A sentence is a request, not a guarantee — and on a masked place
   the failure is the worst kind, because the corrected pixels sit INSIDE the
   original photograph where a 3% cast reads as a visible patch.

   So this measures it. Given the pixels that went out (the original, or the
   selected region for Selection Edit) and the pixels that came back, it
   compares their mid-tone channel means and derives the per-channel gain that
   puts the result back on the original's neutral. That is the classic
   grey-world comparison the studio's own auto-WB already uses on the Retouch
   stage (docs/app/index.html, "gray-world auto white balance"), applied
   between two frames of the same scene instead of inside one.

   THE RULES THIS FOLLOWS, and why each one is here:

   1. MID-TONES ONLY. Blown highlights and crushed shadows carry no colour
      worth matching and would drag the mean; only pixels whose luma sits
      between 8% and 92% are counted.
   2. A DEADZONE. Under ~1.5% of drift there is nothing a viewer can see, and
      correcting noise is how a fix becomes a bug. Below it, nothing is done
      and the caller is told so.
   3. A CEILING. The gain is clamped to ±12% per channel. A workflow is often
      MEANT to change colour — a sky replace, a grade copy — and this must
      never undo the edit the student asked for. It corrects a cast; it cannot
      repaint.
   4. GREEN IS THE ANCHOR. Exposure lives in the luma; matching all three
      channels absolutely would also drag brightness. The gains are normalised
      on green so this moves colour only.
   5. IT ANSWERS HONESTLY. Every call reports the drift it measured and what
      it did, so the panel can say "WB matched +3.4%" rather than claim a
      silent success — the same rule the place path learned in 6.171.0.

   The maths is pure and runs in Node (test/verify_wb_match.js drives it with
   built frames); only applyToDataUrl needs a canvas, which both surfaces have.
   ============================================================================ */
(function () {
  "use strict";

  var LUMA_LO = 0.08, LUMA_HI = 0.92;   /* rule 1 */
  var DEADZONE = 0.015;                 /* rule 2 — 1.5% */
  var MAX_GAIN = 0.12;                  /* rule 3 — ±12% */
  var SAMPLE = 160;                     /* the long edge each frame is measured at */

  function _clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* mean R,G,B over the mid-tones of an {data,width,height} RGBA buffer */
  function means(img) {
    var d = (img && img.data) || [];
    var r = 0, g = 0, b = 0, n = 0;
    for (var i = 0; i + 3 < d.length; i += 4) {
      if (d[i + 3] < 8) continue;                       /* transparent pixels say nothing */
      var R = d[i] / 255, G = d[i + 1] / 255, B = d[i + 2] / 255;
      var y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      if (y < LUMA_LO || y > LUMA_HI) continue;
      r += R; g += G; b += B; n++;
    }
    if (!n) return null;
    return { r: r / n, g: g / n, b: b / n, n: n };
  }

  /* The per-channel gain that moves `out` onto `ref`, normalised on green
     (rule 4) and clamped (rule 3). Returns what it measured either way. */
  function gains(refImg, outImg) {
    var a = means(refImg), b = means(outImg);
    if (!a || !b) return { ok: false, why: "no mid-tone pixels to compare", drift: 0, gain: { r: 1, g: 1, b: 1 } };
    var eps = 1e-4;
    var gr = a.r / Math.max(b.r, eps), gg = a.g / Math.max(b.g, eps), gb = a.b / Math.max(b.b, eps);
    /* colour only: take green out of all three so brightness is untouched */
    var norm = Math.max(gg, eps);
    gr = gr / norm; gb = gb / norm;
    var drift = Math.max(Math.abs(gr - 1), Math.abs(gb - 1));
    var gain = { r: _clamp(gr, 1 - MAX_GAIN, 1 + MAX_GAIN), g: 1, b: _clamp(gb, 1 - MAX_GAIN, 1 + MAX_GAIN) };
    var clamped = (gr !== gain.r) || (gb !== gain.b);
    return {
      ok: drift >= DEADZONE, why: drift >= DEADZONE ? "" : "under the deadzone",
      drift: drift, driftPct: Math.round(drift * 1000) / 10,
      gain: gain, clamped: clamped, refPixels: a.n, outPixels: b.n
    };
  }

  /* apply a gain in place to an RGBA buffer */
  function apply(img, gain) {
    var d = (img && img.data) || [];
    var gr = gain && gain.r || 1, gg = gain && gain.g || 1, gb = gain && gain.b || 1;
    for (var i = 0; i + 3 < d.length; i += 4) {
      d[i] = _clamp(Math.round(d[i] * gr), 0, 255);
      d[i + 1] = _clamp(Math.round(d[i + 1] * gg), 0, 255);
      d[i + 2] = _clamp(Math.round(d[i + 2] * gb), 0, 255);
    }
    return img;
  }

  /* ---- the canvas half (both surfaces have one) -------------------------- */

  function _doc() {
    try { return (typeof document !== "undefined") ? document : null; } catch (e) { return null; }
  }
  function _load(ref) {
    return new Promise(function (resolve) {
      var d = _doc();
      if (!d || !ref) { resolve(null); return; }
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { resolve(null); };
      try { im.src = ref; } catch (e) { resolve(null); }
    });
  }
  function _sample(im, side) {
    var d = _doc();
    if (!d || !im) return null;
    var w = im.naturalWidth || im.width || 0, h = im.naturalHeight || im.height || 0;
    if (!(w > 0 && h > 0)) return null;
    var k = Math.min(1, side / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
    var c = d.createElement("canvas"); c.width = cw; c.height = ch;
    var x = c.getContext("2d"); if (!x) return null;
    x.drawImage(im, 0, 0, cw, ch);
    try { return x.getImageData(0, 0, cw, ch); } catch (e) { return null; }
  }

  /* Measure the result against the original and, when it has really drifted,
     return a corrected data URL. Never throws, never returns a broken picture:
     on any doubt it answers with the picture it was given. */
  function matchDataUrl(refUrl, outUrl) {
    var out = { ref: outUrl, applied: false, driftPct: 0, why: "" };
    var d = _doc();
    if (!d || !refUrl || !outUrl) { out.why = "nothing to compare"; return Promise.resolve(out); }
    return Promise.all([_load(refUrl), _load(outUrl)]).then(function (pair) {
      var refIm = pair[0], outIm = pair[1];
      if (!refIm || !outIm) { out.why = "a picture would not decode"; return out; }
      var refPx = _sample(refIm, SAMPLE), outPx = _sample(outIm, SAMPLE);
      if (!refPx || !outPx) { out.why = "no pixels to measure"; return out; }
      var g = gains(refPx, outPx);
      out.driftPct = g.driftPct || 0;
      if (!g.ok) { out.why = g.why || "already matched"; return out; }
      var w = outIm.naturalWidth || outIm.width, h = outIm.naturalHeight || outIm.height;
      var c = d.createElement("canvas"); c.width = w; c.height = h;
      var x = c.getContext("2d"); if (!x) { out.why = "no canvas"; return out; }
      x.drawImage(outIm, 0, 0);
      var full;
      try { full = x.getImageData(0, 0, w, h); } catch (e) { out.why = "the picture could not be read back"; return out; }
      apply(full, g.gain);
      x.putImageData(full, 0, 0);
      var url = "";
      try { url = c.toDataURL("image/png"); } catch (e2) { url = ""; }
      if (!url || url.length < 32) { out.why = "the corrected picture could not be written"; return out; }
      out.ref = url; out.applied = true; out.clamped = !!g.clamped;
      return out;
    }).catch(function (e) {
      out.why = String((e && e.message) || e || "wb-match failed");
      return out;
    });
  }

  var API = { means: means, gains: gains, apply: apply, matchDataUrl: matchDataUrl,
    LUMA_LO: LUMA_LO, LUMA_HI: LUMA_HI, DEADZONE: DEADZONE, MAX_GAIN: MAX_GAIN, SAMPLE: SAMPLE };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.wbMatch = API; }
})();
