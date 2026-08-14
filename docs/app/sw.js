/* HNK Web Studio service worker — cache-first for library assets,
   network-first for everything else (so app updates arrive immediately). */
var CACHE = "hnk-web-studio-v4-49-0";
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
var LIB_MAX_ENTRIES = 2800;
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

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== LIB_CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
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
