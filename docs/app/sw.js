/* HNK Web Studio service worker — cache-first for library assets,
   network-first for everything else (so app updates arrive immediately). */
var CACHE = "hnk-web-studio-v4-20-19";
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
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  var isLib = url.pathname.indexOf("/lib/") >= 0;
  if (isLib) {
    e.respondWith(
      caches.open(CACHE).then(function (c) {
        return c.match(e.request).then(function (hit) {
          if (hit) return hit;
          return fetch(e.request).then(function (res) {
            if (res && res.ok) c.put(e.request, res.clone());
            return res;
          });
        });
      })
    );
  } else {
    e.respondWith(
      fetch(e.request).then(function (res) {
        return res;
      }).catch(function () {
        return caches.open(CACHE).then(function (c) {
          return c.match(e.request).then(function (hit) {
            if (hit) return hit;
            /* Never cached (e.g. first visit ever, offline) — fall back to
               the app shell for navigations instead of the browser's raw
               network-error screen. */
            if (e.request.mode === "navigate") return c.match(OFFLINE_URL);
            return undefined;
          });
        });
      })
    );
  }
});
