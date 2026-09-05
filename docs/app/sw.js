/* HNK Web Studio service worker — cache-first for library assets,
   network-first for everything else (so app updates arrive immediately). */
var CACHE = "hnk-web-studio-v6-8-0";
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
/* v4.91 — COUNTED AGAIN, and the cap had been outgrown AGAIN. /lib/ now holds
   4836 files: 1811 in ui, 1811 in full, 882 in styles880, 273 in wf, plus
   banners/dash/looks/vid/root. The 500 snoot plates added 1000 files in one
   wave and pushed the tree past the 4200 set in v4.83, which means a studio
   browsing far enough evicts thumbnails it downloaded earlier in the same
   session and re-fetches them on the way back — the exact failure this cap
   exists to prevent, reached the same way as last time, by the library growing.
   6000 clears the whole tree with room for another wave of this size. It bounds
   the entry COUNT, not bytes; the browser's own origin quota is the real size
   ceiling and it evicts the whole cache rather than trimming, which is why an
   explicit cap exists at all. */
var LIB_MAX_ENTRIES = 6000;
/* v5.10 — the face model now lives under /lib/face/ (the face-api bundle, the
   tiny detector weights and the 68-point landmark weights, ~1.9MB). They ride
   the same cache-first branch as the library art, which is exactly what makes
   the Studio work offline after one load. They are NEW names no device has
   ever been served, so they need no LIB_PURGES entry today — but they are
   versioned files that a future release may replace under the same name, and
   the rule documented below applies to them when that happens. */
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
   cache-first design safe for them in the first place.

   v4.91 — that add-only run has now ended, and the v4.91 entry below is what
   ends it cleanly: twelve plates under /lib/{full,ui}/ were re-shot onto their
   own ids. The rule did not change; it simply applies to them now. */
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
  { tag: "./__lib-purge-v4-83-ref413", re: /\/lib\/(full|ui)\/user-ref-413\.jpg$/ },
  /* v4.91 — two replacements in this wave, and one non-replacement worth
     naming so nobody adds an entry for it later.

     The twelve Portrait Light Study plates were re-shot to the fairer, softer
     skin the owner asked for and land on the SAME ids, user-ref-1300 to 1311.
     Targeted by that exact range rather than by /lib/full/ as a whole: the
     library is now 1811 plates in each of two sizes, and re-fetching 3622
     files to deliver 24 would cost a studio on mobile data real money.

     The Newborn scene card was redrawn baby-only, replacing pr-scnNewborn.jpg
     under its own name. cards5 is 13MB, so it is named individually too.

     The 500 new snoot plates are user-ref-1312 upward — ids no device has ever
     been served — so a cache miss fetches them normally and they need NO entry
     here. This list is only ever for files replaced under a name already in
     the wild. */
  { tag: "./__lib-purge-v4-91-lightstudy12", re: /\/lib\/(full|ui)\/user-ref-13(0\d|1[01])\.jpg$/ },
  { tag: "./__lib-purge-v4-91-newborn-card", re: /\/lib\/wf\/cards5\/pr-scnNewborn\.jpg$/ },
  /* v4.93 — the owner's thirteen returned card images.

     ELEVEN of them replace art already in the wild under its own name: the ten
     cards that carried the feather at the mouth, plus the Wedding Field card
     re-shot for proportion. /lib/ is cache-first and never revalidated, so
     without this marker every existing install keeps the old art forever.

     The other TWO — scene-fit-pro and master-pro-retouch — are filenames no
     device has ever been served, because those workflows shipped in v4.88
     with no card at all. A cache miss fetches them normally. They are
     deliberately absent from this regex; adding them would cost every user a
     re-fetch to deliver a file they never had. */
  { tag: "./__lib-purge-v4-93-cards13", re: new RegExp("/lib/wf/cards5/(film-grade|lg-bglight|lg-hair|text-logo|upscale|white-balance-fix|mx-bg|mx-color|mx-fg|mx-object|pl-5)\\.jpg$") },
  /* v4.95 — the ten makeup video cards, replaced under their own names.

     THIS IS THE OPPOSITE CALL FROM ONE RELEASE AGO, AND FOR THE OPPOSITE
     REASON. v4.94 shipped these ten filenames for the first time, carrying art
     cut from the owner's own clips, and deliberately added no marker: a
     brand-new name inside one charges every user a re-fetch for a file they
     never had. That reasoning expired the moment v4.94 reached Pages. The
     names are now in the wild, the owner has returned generated art for all
     ten, and /lib/ is cache-first and never revalidated — so without this
     entry every device that opened the Video page under v4.94 keeps the
     footage crops for ever.

     Named individually rather than re-purging /lib/vid/, even though the
     folder marker exists: that tag was set in v4.83 and can never fire again,
     and the folder also holds nineteen cards this wave does not touch. Ten
     names, ten files, ~1.1MB. */
  { tag: "./__lib-purge-v4-95-mkcards10", re: new RegExp("/lib/vid/vw-(mkGlassSkin|mkGemTear|mkDouyinRed|mkGlossPop|mkPorcelain|mkPinkBridal|mkDollBlush|mkSculptBrush|mkEyeMacro|mkNoirSlip)\\.jpg$") },
  /* v4.97 — the 500 lighting plates, re-shot from scratch onto the SAME ids.

     v4.91 shipped user-ref-1312..1811 as a 100x50 parameter grid of beam
     shapes and edge qualities. The owner's verdict was that they were
     meaningless and repetitive, and measurement agreed: every catalogue entry
     carried a lighting name and nothing else. The replacements are nine real
     families a studio actually books — birthday by age, night portrait,
     fashion editorial, prewedding, Chinese wedding, window light, leaf gobo,
     and snoot both touching and not touching the subject.

     Same ids, new pictures, so this marker is mandatory: /lib/ is cache-first
     and never revalidated, and without it every device that ever opened the
     Library keeps the rejected grid for ever. Bounded to 1312-1811 rather than
     /lib/full|ui/ as a whole — those two folders hold 1811 plates EACH, and
     re-fetching 3622 files to deliver 1000 would cost a studio on mobile data
     real money. */
  { tag: "./__lib-purge-v4-97-lighting500", re: new RegExp("/lib/(full|ui)/user-ref-(13(1[2-9]|[2-9][0-9])|1[4-7][0-9][0-9]|18(0[0-9]|1[01]))\\.jpg$") },
  /* v6.6.1 — THE SAME BUG THIS LIST EXISTS FOR, WALKED INTO AGAIN. Over
     6.4.0, 6.5.0 and 6.6.0 the nine Video Smart Workflow cards were re-shot
     three times and written back under their own filenames. The owner opened
     the V→V page and saw exactly one card carrying its new art — vtHeadSwap,
     the tenth, whose filename no device had ever cached — while the other
     nine still showed pictures replaced days ago. Nothing was wrong with the
     files, the deploy or the release: /lib/ is served cache-first and never
     revalidated, and the only /lib/vid/ entry above is v4.83's, whose marker
     was set on every device long ago and can never fire again.

     Nine names, not the folder: /lib/vid/ also holds the 36 vw-* workflow
     cards, and re-downloading those to repair nine files is the mobile-data
     waste this list's precision rule exists to avoid. vt-headswap is
     deliberately absent — it is a NEW path, so a cache miss fetches it
     normally, which is precisely why it was the one card that looked right. */
  { tag: "./__lib-purge-v6-6-1-v2v-cards", re: new RegExp("/lib/vid/vt-(charSwap|faceSwap|anime|filmlook|heritage|extend|restore|erasesub|char30)\\.jpg$") },
  /* v6.6.1 — AND TWO THE SAME AUDIT FOUND. Looking for what else had been
     replaced in place turned up two workflow cards nobody had noticed:
     look-golden-grecian.jpg (5.97.0, the blown white corner) and
     studio-look-copy.jpg (5.91.0). Both DO match v4.64's cards5 pattern —
     which is exactly why they were missed. That entry's marker was set on
     every device back at v4.64, so it can never fire again, and "a pattern
     matches it" is not the same question as "an entry that has not yet run
     here matches it". They get their own marker, and the test added with
     this release asks the second question rather than the first. */
  { tag: "./__lib-purge-v6-6-1-cards5-refresh", re: new RegExp("/lib/wf/cards5/(look-golden-grecian|studio-look-copy)\\.jpg$") },
  /* v6.7.1 — THE SAME FILES AGAIN, UNDER A NEW MARKER. The 6.6.1 entries above
     ran on every device and set their markers, so they can never fire again —
     but they ran through the broken refill described at purgeReplacedLibArt,
     which handed the browser's HTTP cache straight back. Those devices are
     still showing the old art with the repair already marked done, which is
     exactly what the owner is looking at on 6.7.0. A spent marker cannot be
     un-spent, so the repair needs a new one. */
  { tag: "./__lib-purge-v6-7-1-http-refill", re: new RegExp("/lib/(vid/vt-(charSwap|faceSwap|anime|filmlook|heritage|extend|restore|erasesub|char30)|wf/cards5/(look-golden-grecian|studio-look-copy))\\.jpg$") }
];

/* v6.6.1 — AND THE PAGE IS TOLD WHAT WENT, which is what makes the repair
   land on THIS launch instead of the next one. The purge itself has always
   worked; the trouble is when it runs. A page paints its art from the cache
   while the new worker is still installing, so by the time activate deletes
   the stale copies the student is already looking at them, and only a SECOND
   launch shows the new ones. The owner hit exactly that and reported the
   cards still wrong after the release that fixed them.

   So the purge collects the URLs it deleted and hands them to every open
   client, which re-requests just those pictures. Nothing is reloaded and no
   work in progress is disturbed — a student mid-prompt keeps their prompt. */
/* v6.7.1 — DELETING IS NOT ENOUGH, AND THAT IS WHY THIS BUG SURVIVED THREE
   FIXES. Everything here used to do one thing: drop the entry from the
   SERVICE WORKER cache and let the page ask for the picture again. But that
   second request is a plain fetch, and a plain fetch is served by the
   BROWSER'S OWN HTTP CACHE, which is still holding the old JPEG under the
   same URL. The old bytes came straight back and were written into the fresh
   cache — a purge that purged nothing, on every device that had ever loaded
   the card. The one card that looked right after 6.6.1 was the one whose
   filename had never been requested before, so neither cache had a copy of
   it; that was the tell, and I read it as an exception instead of the
   signature it was.

   So the refill is explicit now: each removed URL is re-fetched with
   cache:"reload", which bypasses the HTTP cache, and the fresh response is
   put back before the page ever asks. AND THE MARKER IS ONLY SET IF THAT
   WORKED. A device that was offline during activation retries on the next
   launch instead of burning its one chance, which is the other half of why
   this became permanent. */
function purgeRefill(c, url) {
  return fetch(new Request(url, { cache: "reload", credentials: "same-origin" }))
    .then(function (res) {
      if (!res || !res.ok) throw new Error("refill failed");
      return c.put(url, res.clone());
    });
}
function purgeReplacedLibArt() {
  var removed = [];
  return caches.open(LIB_CACHE).then(function (c) {
    return Promise.all(LIB_PURGES.map(function (p) {
      return c.match(p.tag).then(function (done) {
        if (done) return;                   /* this entry already ran here */
        var failed = false;
        return c.keys().then(function (keys) {
          return Promise.all(keys.filter(function (k) {
            try { return p.re.test(new URL(k.url).pathname); } catch (err) { return false; }
          }).map(function (k) {
            var url = k.url;
            return c.delete(k).then(function () {
              removed.push(url);
              return purgeRefill(c, url).catch(function () { failed = true; });
            });
          }));
        }).then(function () {
          /* an entry that could not be replaced stays unmarked, so the next
             launch tries again rather than leaving the old picture for ever */
          if (failed) return;
          return c.put(p.tag, new Response("1"));
        });
      });
    }));
  }).then(function () {
    if (!removed.length) return;
    return self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then(function (cs) {
      cs.forEach(function (client) {
        try { client.postMessage({ type: "hnk-lib-purged", urls: removed }); } catch (err) { }
      });
    });
  }).catch(function () { /* a failed purge must never block activation */ });
}

self.addEventListener("activate", function (e) {
  /* v5.46 — ACTIVATION SURVIVES A BROKEN CACHE STORAGE. caches.keys() itself
     can reject (exhausted quota, a corrupted profile, endpoint security
     products that wall off storage APIs — all real on studio Windows
     machines). An unhandled rejection here fails activation and strands the
     customer on whatever worker came before, so storage failure is absorbed
     and the worker claims its clients regardless. */
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== LIB_CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(purgeReplacedLibArt)
      .catch(function () {})
      .then(function () { return self.clients.claim(); })
      .catch(function () {})
  );
});

self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  /* THE API IS NOT AN ASSET, and since it moved to this origin the worker can
     see it for the first time. While the app talked to a Supabase hostname,
     every account request was cross-origin and the line above ignored it. Now
     /api/... is same-origin and would fall through to the network-first branch
     at the bottom, whose failure path answers from the shell cache — so a
     momentary outage could serve a CACHED profile, and on a shared phone that
     is one customer's account answering for another. It also broke three
     access-wall checks the moment the base URL changed, which is how it was
     found. Nothing under /api is ever cached or replayed. */
  if (url.pathname === "/api" || url.pathname.indexOf("/api/") === 0) return;
  /* v5.57.0 — hero motion clips are streamed by the <video> element (Range
     requests, multi-MB payloads). They must never enter LIB_CACHE: a full
     cached response breaks range semantics, and eleven clips would LRU-evict
     the thumbnails the cache exists to protect. Left to the browser, whose
     own HTTP cache handles media correctly. */
  if (url.pathname.indexOf("/lib/banners/motion/") >= 0) return;
  var isLib = url.pathname.indexOf("/lib/") >= 0 && !LIB_ICON_RE.test(url.pathname);
  if (isLib) {
    /* v5.46 — THE CACHE MUST NEVER TAKE DOWN WHAT IT EXISTS TO PROTECT. On a
       desktop whose Cache Storage is broken (quota exhausted, profile
       corruption, endpoint security walling off the API), caches.open() or
       c.match() rejects — and because this branch owns the request via
       respondWith, that rejection killed EVERY /lib/ image on the machine
       while the network sat healthy underneath: broken hero banners, blank
       tool cards, a library of grey icons. The phone worked, the desktop
       didn't, and the difference was never the site. Every cache failure now
       falls back to the plain network fetch, and cache writes are best-effort. */
    e.respondWith(
      caches.open(LIB_CACHE).then(function (c) {
        return c.match(e.request).then(function (hit) {
          if (hit) return hit;
          return fetch(e.request).then(function (res) {
            if (res && res.ok) {
              try {
                c.put(e.request, res.clone()).catch(function () {});
                /* LRU-ish insurance: cap the lib cache so it can't grow
                   without bound (Cache API keys() returns insertion order —
                   delete the oldest entries past the cap). */
                c.keys().then(function (keys) {
                  if (keys.length > LIB_MAX_ENTRIES) {
                    keys.slice(0, keys.length - LIB_MAX_ENTRIES).forEach(function (k) { c.delete(k); });
                  }
                }).catch(function () {});
              } catch (err) {}
            }
            return res;
          });
        });
      }).catch(function () { return fetch(e.request); })
    );
  } else if (e.request.mode === "navigate") {
    /* v5.32 — NAVIGATIONS ARE STALE-WHILE-REVALIDATE, NOT NETWORK-FIRST.
       Every other request below still goes to the network first; this branch
       is only the app shell, and the shell is the one asset where waiting was
       indefensible. It is a 3.3MB document, and the target user is a studio on
       intermittent Myanmar mobile data opening the app several times a day.
       Network-first meant every one of those launches re-fetched the whole
       document and BLOCKED on it — the cached copy was only ever a
       failure fallback, so a slow link cost the full download before anything
       appeared, and a flaky one cost a timeout first.

       Serving the cached shell immediately and refreshing it in the background
       is safe here specifically because CACHE is versioned by release
       (hnk-web-studio-vX-Y-Z) and activate deletes every other cache: a new
       release can never be served from an old key, so the worst case is one
       launch on the previous version, which the app's own version check
       already surfaces as an update toast. */
    e.respondWith(
      caches.open(CACHE).then(function (c) {
        return c.match(OFFLINE_URL).then(function (hit) {
          var net = fetch(e.request).then(function (res) {
            if (res && res.ok) { try { c.put(OFFLINE_URL, res.clone()).catch(function () {}); } catch (err) {} }
            return res;
          }).catch(function () {
            return hit || new Response("", { status: 504, statusText: "offline" });
          });
          /* cached shell now if we have one; otherwise wait for the network */
          return hit || net;
        });
      /* same storage-failure rule as the /lib/ branch: a broken Cache Storage
         must degrade to plain network, never to a dead app shell */
      }).catch(function () { return fetch(e.request); })
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
            /* explicit offline error instead of resolving undefined
               (which threw a noisy TypeError in respondWith) */
            var offline = new Response("", { status: 504, statusText: "offline" });
            if (e.request.mode === "navigate") {
              return c.match(OFFLINE_URL).then(function (shell) { return shell || offline; });
            }
            return offline;
          });
        /* network AND cache storage both down: answer offline, don't throw */
        }).catch(function () { return new Response("", { status: 504, statusText: "offline" }); });
      })
    );
  }
});
