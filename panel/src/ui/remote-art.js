/* ============================================================
   HNK — remote art loader (v6.107.0)

   MEASURED, not guessed. The owner installed 6.106.0 in real Photoshop and
   photographed the Workflows page: "Subject / Face" and "AI Retouch" carry
   their pictures, every other card in the same grid is an empty box. Those
   two are the cards whose art ships inside the plugin (panel/icons/cards/);
   the rest name the licensed host over https. On the same build, the Library
   page draws all of its plates — and the Library is the one surface that does
   NOT use <img src="https://…">: it fetches the bytes and paints a data: URL
   (js/hnk_library_compact_cards.js, since 6.47.1). Text→Img and Imagine, which
   reference no remote picture at all, are perfect.

   Local file: draws. data: URL: draws. Remote <img src>: blank, with no error
   event of any kind — the element neither loads nor fails, so the onerror
   fallbacks written for this case never ran and the card kept its empty box.
   There is no counterexample in either direction.

   So this module gives every remote picture in the panel the Library's proven
   path: fetch (the manifest already grants the host, and the same host serves
   the sign-in API), base64, data: URL. A browser needs none of this and is
   unharmed by it — the bytes arrive either way.

   Two things this buys beyond the pictures themselves:
     - a fetch FAILS LOUDLY. Where <img> went silent, this reports a status
       and a reason, which the Setup self-test card shows and the caller can
       turn into a labelled placeholder instead of a black rectangle.
     - the panel stops depending on a renderer behaviour nobody documented.
   ============================================================ */
(function () {
"use strict";

var CACHE_CAP = 320;          /* ~194 workflow cards + the home strip + video shelves */
var MAX_INFLIGHT = 6;         /* a panel opening 194 cards at once should not open 194 sockets */
var MAX_BYTES = 8 * 1024 * 1024;

var cache = {};               /* url -> data: URL */
var order = [];
var inflight = {};            /* url -> Promise */
var queue = [];
var active = 0;
var stats = { asked: 0, ok: 0, failed: 0, bytes: 0, lastError: "" };

var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/* the Library's encoder, which has run in Photoshop since 6.47.1.

   MEASURED before shipping, because a wrong encoder corrupts every picture and
   would look like a renderer fault: byte-identical to Node's own base64 for
   every length 0..400 (so every length mod 3, both padding cases) and for a
   real 120,049-byte catalogue card. Cost: 12.5 ms per card, about 2.4 s of CPU
   for all 194 — spent inside the fetch callbacks, six at a time, so it lands as
   single dropped frames rather than one stall. */
function toB64(buf) {
  var u = new Uint8Array(buf), out = [], i, n = u.length;
  for (i = 0; i + 2 < n; i += 3) {
    var a = u[i], b = u[i + 1], c = u[i + 2];
    out.push(B64[a >> 2], B64[((a & 3) << 4) | (b >> 4)], B64[((b & 15) << 2) | (c >> 6)], B64[c & 63]);
  }
  if (i < n) {
    var x = u[i], y = (i + 1 < n) ? u[i + 1] : 0;
    out.push(B64[x >> 2], B64[((x & 3) << 4) | (y >> 4)],
      (i + 1 < n) ? B64[(y & 15) << 2] : "=", "=");
  }
  return out.join("");
}

function remember(url, data) {
  if (!cache[url]) {
    order.push(url);
    while (order.length > CACHE_CAP) {
      var old = order.shift();
      if (old !== url) delete cache[old];
    }
  }
  cache[url] = data;
}

function isRemote(url) { return /^https?:/i.test(String(url || "")); }

function pump() {
  while (active < MAX_INFLIGHT && queue.length) {
    var job = queue.shift();
    active++;
    job();
  }
}

function fetchArt(url) {
  if (cache[url]) return Promise.resolve(cache[url]);
  if (inflight[url]) return inflight[url];
  var p = new Promise(function (resolve, reject) {
    queue.push(function () {
      var done = function () { active--; delete inflight[url]; pump(); };
      var f = (typeof fetch === "function") ? fetch : null;
      if (!f) { done(); stats.failed++; stats.lastError = "no fetch"; reject(new Error("no fetch")); return; }
      f(url).then(function (r) {
        if (!r || !r.ok) throw new Error("HTTP " + (r && r.status));
        var ct = "";
        try { ct = (r.headers && r.headers.get && r.headers.get("content-type")) || ""; } catch (e) { ct = ""; }
        return r.arrayBuffer().then(function (buf) {
          if (!buf || !buf.byteLength) throw new Error("empty");
          if (buf.byteLength > MAX_BYTES) throw new Error("too large");
          var mime = /^image\//i.test(ct) ? ct.split(";")[0].trim().toLowerCase() : "image/jpeg";
          var data = "data:" + mime + ";base64," + toB64(buf);
          remember(url, data);
          stats.ok++; stats.bytes += buf.byteLength;
          done();
          resolve(data);
        });
      }).catch(function (e) {
        stats.failed++;
        stats.lastError = (url.split("/").pop() || url) + ": " + ((e && e.message) || "failed");
        done();
        reject(e);
      });
    });
    pump();
  });
  inflight[url] = p;
  return p;
}

/* paint(img, url, onFail)
   A local path is set straight onto the element — those have always drawn.
   A remote one is fetched and handed over as a data: URL; onFail runs when the
   bytes never arrive, so the caller can show a labelled placeholder rather
   than the silent black box <img> left behind. */
function paint(img, url, onFail) {
  if (!img || !url) return;
  stats.asked++;
  if (!isRemote(url)) { img.src = url; return; }
  if (cache[url]) { img.src = cache[url]; return; }
  fetchArt(url).then(function (data) {
    img.src = data;
  }, function (e) {
    if (typeof onFail === "function") { try { onFail(e); } catch (e2) { } }
  });
}

/* the same for a CSS background (the Library's shape, kept for callers that
   need object-fit behaviour UXP does not provide) */
function paintBg(node, url, onFail) {
  if (!node || !url) return;
  stats.asked++;
  if (!isRemote(url)) { node.style.backgroundImage = 'url("' + url + '")'; return; }
  fetchArt(url).then(function (data) {
    node.style.backgroundImage = 'url("' + data + '")';
  }, function (e) {
    if (typeof onFail === "function") { try { onFail(e); } catch (e2) { } }
  });
}

var API = {
  paint: paint,
  paintBg: paintBg,
  load: fetchArt,
  isRemote: isRemote,
  stats: function () {
    return { asked: stats.asked, ok: stats.ok, failed: stats.failed,
      pending: active + queue.length, bytes: stats.bytes, lastError: stats.lastError };
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.remoteArt = API; }
})();
