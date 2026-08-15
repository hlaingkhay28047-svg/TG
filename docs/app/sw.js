/* HNK Web Studio service worker — cache-first for library assets,
   network-first for everything else (so app updates arrive immediately). */
var CACHE = "hnk-web-studio-v4-89-0";
/* /lib/ images live in their own cache so an app-shell release does NOT
   wipe the (up to ~52MB) library thumbnails a customer already downloaded
   on mobile data. Bump LIB_CACHE ONLY when files under /lib/ actually
   change (they are replaced under the same filenames, so renaming this
   cache is what invalidates stale copies). */
var LIB_CACHE = "hnk-lib-v1";
/* The cap has to clear the library's own size or browsing it evicts what you
   just downloaded: 607 items today, each with a /ui/ thumb and a /full/ copy,
   plus banners and workflow art. 400 was set when the library was 355 items
   and one file each. */
/* v4.45: +880 style-pack references under /lib/styles880/ — the cap must
   clear ui+full+banners+wf+styles880 combined or browsing the style pack
   evicts library thumbnails the customer already paid data for. */
/* v4.83 — COUNTED, not estimated. /lib/ now holds 3819 files: 1311 in ui,
   1311 in full, 880 in styles880, 269 in wf, plus banners/dash/looks/vid/root.
   The cap stood at 2800 while the library alone passed it, which means a
   studio browsing far enough evicts the thumbnails it downloaded earlier in
   the same session and re-fetches them on the way back — the exact failure
   this cap was written to prevent, arrived at by the library growing past it.
   4200 clears the whole tree with room for one more wave. It bounds the entry
   COUNT, not bytes; the browser's own origin quota is the real size ceiling
   and it evicts the whole cache rather than trimming, which is why an
   explicit cap exists at all. */
var LIB_MAX_ENTRIES = 4200;
/* v4.28: the PWA icon set is the ONLY thing that lives at /lib/ root (the
   real library thumbnails all sit in /lib/{banners,full,ui,wf}/). Icons get
   re-arted between releases — the identity wave replaced all five — so they
   must NOT ride the never-revalidated lib cache; route them through the
   network-first branch instead. That refreshes a new logo on the next online
   launch without wiping the up-to-~52MB of thumbnails LIB_CACHE protects. */
var LIB_ICON_RE = /\/lib\/(icon-192|icon-512|icon-maskable-512|apple-touch-icon|favicon-48)\.png$/;
var OFFLINE_URL = "./index.html";

self.addEventListener("install", function (e) {
  self.skipWaiting();
  /* Pre-cache the app shell so a never-visited-before navigation while
     offline (e.g. a fresh install opened with no connection) still gets
     the app instead of the browser's bare network-error page. */
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.add(OFFLINE_URL).catch(function () {}); })
  );
});

/* v4.68 — THE STALE-ART BUG, and why it is not fixed by bumping LIB_CACHE.
   Everything under /lib/ is served cache-first and NEVER revalidated: the
   fetch handler returns `hit` and stops. That is deliberate and right for
   thumbnails a customer paid mobile data for. But it means a file REPLACED
   under its own name is invisible to a returning customer for ever, and in
   v4.64 all 116 workflow cards were replaced under their own names. Anyone who
   had opened the Workflow page before that release kept seeing the OLD 840x630
   art, on a phone, with no way to clear it.

   Renaming LIB_CACHE would fix it by making every customer re-download up to
   52MB of library thumbnails they already have. So instead the worker purges
   exactly the paths that were replaced, once, guarded by a marker written into
   the cache itself. Add a new tag + pattern here whenever files under /lib/ are
   replaced under their own names — that is the whole maintenance rule.

   v4.69 — ONE LIST, ONE MARKER EACH. The first cut of this fix carried a
   single tag, which quietly made the maintenance rule above impossible to
   follow: widening the pattern under the old tag skips every device that had
   already purged, and renaming the tag re-purges paths that were already
   fixed. Each entry now owns its own marker, so adding one never costs a
   customer a re-download of what an earlier entry already repaired.

   THE LIST IS COMPLETE, and that was measured rather than assumed: every
   commit that ever touched docs/app/lib was scanned for files MODIFIED in
   place rather than added. The whole history yields 121 such files — the 116
   cards, styles880/catalog.json, icon-512.png, and three files under the long
   deleted lib/wf/cards/. Icons already ride the network-first branch via
   LIB_ICON_RE, and the deleted directory has no live URL, so the two entries
   below are the only live exposure. The library plates under /lib/{ui,full,
   banners}/ have never once been modified in place, which is what makes the
   cache-first design safe for them in the first place. */
var LIB_PURGES = [
  /* v4.64 — all 116 workflow cards were re-arted and re-fitted to 960x640
     under their own filenames. */
  { tag: "./__lib-purge-v4-64-cards5", re: /\/lib\/wf\/cards5\// },
  /* The 880-style catalogue, replaced in place twice: v4.48 gave 800 of its
     880 records a `q` search field, and v4.69 backfilled the other 80 (all of
     skin_type and eyelash, which had shipped with no search keywords at all —
     no way to find a lash by "c-curl" or a skin by its finish). Because the
     search reads `rec.q || ""`, a stale copy does not break anything; it just
     returns quietly poorer results for ever. A stale JSON manifest is worse
     than stale art precisely because nothing looks wrong. The tag is dated
     v4.69 because that is the release this entry first reaches a device — no
     phone has ever seen an earlier one. */
  { tag: "./__lib-purge-v4-69-styles880-catalog", re: /\/lib\/styles880\/catalog\.json$/ },
  /* v4.73 — the Studio's base sample photograph was replaced under its own
     name. Every look tile is graded FROM it before a customer loads a photo, so
     a device still holding the old one shows the whole shelf built on the wrong
     face. The sixteen new look previews live at fresh paths under /lib/looks/
     and need no entry: a cache miss fetches them normally. */
  { tag: "./__lib-purge-v4-73-st-sample", re: /\/lib\/st-sample\.jpg$/ },
  /* v4.79 — two workflow cards and the Scene banner were redrawn and replaced
     under their own names. The v4.64 cards5 entry cannot be reused: it has
     already run on every device, so its marker is set and it would never fire
     again. Targeting the two files by name rather than re-purging the whole
     cards5 folder matters — that folder is 12MB, and a studio on mobile data
     should not re-download 116 cards to receive 2. */
  { tag: "./__lib-purge-v4-79-cards5-refresh", re: /\/lib\/wf\/cards5\/(mx-light|pl-5)\.jpg$/ },
  { tag: "./__lib-purge-v4-79-dash-scene", re: /\/lib\/dash\/scene\.jpg$/ },
  /* v4.83 — three separate replacements, three separate markers.

     The six video cards shipped one release ago built from repurposed Library
     plates (the image keys were out of credit); these are the real ones, drawn
     for the job. /lib/vid/ is entirely this feature's, so the folder pattern
     is exact rather than lazy.

     The twelve Path look chips and one Library plate carried the feather-in-
     the-mouth motif the owner asked to be rid of. lookchips is 12 files and
     ~1MB, so the folder is fine; user-ref-413 is named individually because
     /lib/full and /lib/ui hold 1311 plates each and re-fetching 2622 files to
     deliver 2 would cost a studio on mobile data real money. */
  { tag: "./__lib-purge-v4-83-vid-cards", re: /\/lib\/vid\// },
  { tag: "./__lib-purge-v4-83-lookchips", re: /\/lib\/wf\/lookchips\// },
  { tag: "./__lib-purge-v4-83-ref413", re: /\/lib\/(full|ui)\/user-ref-413\.jpg$/ }
];

function purgeReplacedLibArt() {
  return caches.open(LIB_CACHE).then(function (c) {
    return Promise.all(LIB_PURGES.map(function (p) {
      return c.match(p.tag).then(function (done) {
        if (done) return;                   /* this entry already ran here */
        return c.keys().then(function (keys) {
          return Promise.all(keys.filter(function (k) {
            try { return p.re.test(new URL(k.url).pathname); } catch (err) { return false; }
          }).map(function (k) { return c.delete(k); }));
        }).then(function () {
          return c.put(p.tag, new Response("1"));
        });
      });
    }));
  }).catch(function () { /* a failed purge must never block activation */ });
}

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== LIB_CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(purgeReplacedLibArt).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  var isLib = url.pathname.indexOf("/lib/") >= 0 && !LIB_ICON_RE.test(url.pathname);
  if (isLib) {
    e.respondWith(
      caches.open(LIB_CACHE).then(function (c) {
        return c.match(e.request).then(function (hit) {
          if (hit) return hit;
          return fetch(e.request).then(function (res) {
            if (res && res.ok) {
              c.put(e.request, res.clone());
              /* LRU-ish insurance: cap the lib cache so it can't grow
                 without bound (Cache API keys() returns insertion order —
                 delete the oldest entries past the cap). */
              c.keys().then(function (keys) {
                if (keys.length > LIB_MAX_ENTRIES) {
                  keys.slice(0, keys.length - LIB_MAX_ENTRIES).forEach(function (k) { c.delete(k); });
                }
              }).catch(function () {});
            }
            return res;
          });
        });
      })
    );
  } else {
    e.respondWith(
      fetch(e.request).then(function (res) {
        /* Keep the offline shell copy fresh: every successful online
           navigation re-caches index.html, which also self-heals a
           failed install-time precache. */
        if (e.request.mode === "navigate" && res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { return c.put(OFFLINE_URL, copy); }).catch(function () {});
        }
        return res;
      }).catch(function () {
        return caches.open(CACHE).then(function (c) {
          return c.match(e.request).then(function (hit) {
            if (hit) return hit;
            /* Never cached (e.g. first visit ever, offline) — fall back to
               the app shell for navigations instead of the browser's raw
               network-error screen. */
            /* explicit offline error instead of resolving undefined
               (which threw a noisy TypeError in respondWith) */
            var offline = new Response("", { status: 504, statusText: "offline" });
            if (e.request.mode === "navigate") {
              return c.match(OFFLINE_URL).then(function (shell) { return shell || offline; });
            }
            return offline;
          });
        });
      })
    );
  }
});
