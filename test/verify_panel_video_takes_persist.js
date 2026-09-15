/* verify_panel_video_takes_persist.js — 6.87.0 / panel 6.158.0
   THE VIDEO TAKES SURVIVE A PANEL RELOAD; THE GALLERY LISTS THEM; HISTORY
   GETS A VIDEOS SECTION.

   Until 6.157.0 every video page (Video · V→V · Talking Photo · Upscale)
   kept its takes in memory only, while its own strip words promised "they
   stay until you delete them": a panel reload emptied the four strips, and
   RunningHub's result links die after 24 hours. The web app keeps a Video
   take in its Gallery; the panel now keeps them the only way a Photoshop
   plugin can — as files in its own data folder:

     1. src/app/takes-store.js: record(entry) writes the bytes as
        <page>-<ts>.mp4 through the gallery store, adds the record (newest
        first), caps 12 per page (the oldest loses its copy too) and
        rewrites hnk_video_takes.json; load() at boot; remove / forgetFile /
        clear drop records and copies; readDataUrl reads a copy back.
     2. main.js: vidGenerate, vtRun and mkTakes (Talk · Upscale) hand every
        take to the store; takesRestoreP repaints the four strips at boot;
        Download again reads the copy when the in-memory bytes are gone
        (takesRefP); ✕ and Clear drop the copy with the record; the Video
        page gains Open the folder (the gallery folder).
     3. The Gallery page lists an mp4 as a black "MP4 · page · time" tile:
        picked, it offers Open the folder · Save · ★ · Delete and no IMAGE
        slots; a delete there forgets the record.
     4. History ▸ Videos (history-screen.js renderTakes): page badge, tool ·
        resolution · length · time · file, Open → that page, that take.

   Fault-injected while writing: takesRecordP("video") removed fails A2/C1;
   the cap loop removed fails B2; takesRestoreP not called at boot fails
   A2/C3; galIsVideo tiles removed fails A3/C5; renderTakes removed fails
   A4/C6. Usage: PORT=8931 node test/verify_panel_video_takes_persist.js */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("docs/app/index.html");
const MAIN = read("panel/main.js");
const CSS = read("panel/styles.css");
const PHTML = read("panel/index.html");
const STORE = read("panel/src/app/takes-store.js");
const GSTORE = read("panel/src/app/gallery-store.js");
const HSCREEN = read("panel/src/ui/screens/history-screen.js");
const WHATS = read("panel/js/hnk_whats_new.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const CLIP_B64 = "AAAAHGZ0eXBpc29t";   /* 12 bytes: an MP4 ftyp box head */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}
const count = (src, re) => (src.match(re) || []).length;

/* an in-memory UXP data folder — the same shape in Node (B) and in the page (C) */
const FAKE_FS_SRC = `(function () {
  function mkFile(p, name, del) {
    var data = null;
    return { isFile: true, isFolder: false, name: name, nativePath: p,
      write: function (d) { data = (typeof d === "string") ? d : new Uint8Array(d); return Promise.resolve(); },
      read: function (o) {
        if (o && o.format === "binary") {
          if (data instanceof Uint8Array) return Promise.resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
          return Promise.resolve(new TextEncoder().encode(String(data || "")).buffer);
        }
        return Promise.resolve(typeof data === "string" ? data : new TextDecoder().decode(data || new Uint8Array()));
      },
      delete: function () { del(); return Promise.resolve(); },
      _data: function () { return data; } };
  }
  function mkFolder(p) {
    var ents = new Map();
    var F = { isFile: false, isFolder: true, name: p.split("/").pop(), nativePath: p, _ents: ents,
      getEntry: function (n) { return ents.has(n) ? Promise.resolve(ents.get(n)) : Promise.reject(new Error("ENOENT " + n)); },
      getEntries: function () { return Promise.resolve(Array.from(ents.values())); },
      createFolder: function (n) { var f = mkFolder(p + "/" + n); ents.set(n, f); return Promise.resolve(f); },
      createFile: function (n) { var f = ents.get(n); if (!f || !f.isFile) { f = mkFile(p + "/" + n, n, function () { ents.delete(n); }); ents.set(n, f); } return Promise.resolve(f); } };
    return F;
  }
  var root = mkFolder("/tmp/hnkdata");
  var uxp = { storage: { localFileSystem: { getDataFolder: function () { return Promise.resolve(root); } }, formats: { utf8: "utf8", binary: "binary" } } };
  return { root: root, uxp: uxp,
    names: function () { return Array.from(root._ents.keys()); },
    gallery: function () { var g = root._ents.get("gallery"); return g ? Array.from(g._ents.keys()) : []; },
    index: function () { var f = root._ents.get("hnk_video_takes.json"); return f ? f.read({ format: "utf8" }).then(function (s) { return JSON.parse(s); }) : Promise.resolve(null); } };
})()`;

(async () => {
  /* ---------------- A. source pins ---------------- */
  report("A1) the takes store: src/app/takes-store.js loaded after gallery-store, one file hnk_video_takes.json, 12 per page, four pages, record → gallery copy <page>-<ts>.mp4 → cap → index; load / list / remove / forgetFile / clear / readDataUrl / galleryPath; a test may hand in the host (HNK.__uxpForTests) in both stores; the gallery store reads an mp4 back as video/mp4",
    PHTML.indexOf('<script src="src/app/takes-store.js"></script>') > PHTML.indexOf('<script src="src/app/gallery-store.js"></script>') &&
    /var FILE = "hnk_video_takes\.json";/.test(STORE) && /var CAP = 12;/.test(STORE) && /var PAGES = \["video", "v2v", "talk", "upscale"\];/.test(STORE) &&
    /entry\.galleryFile = \(await gs\.save\(b64, "mp4", entry\.page\)\) \|\| "";/.test(STORE) && /if \(n > CAP\) \{ var old = _list\.splice\(i, 1\)\[0\]; i--; await _dropCopy\(old\); \}/.test(STORE) &&
    /JSON\.stringify\(\{ v: 1, takes: _list \}\)/.test(STORE) && /var API = \{ load: load, record: record, list: list, remove: remove, forgetFile: forgetFile, clear: clear,\n\s*readDataUrl: readDataUrl, galleryPath: galleryPath, CAP: CAP, FILE: FILE, PAGES: PAGES, _reset: _reset \};/.test(STORE) &&
    /globalThis\.HNK\.takesStore = API;/.test(STORE) && /globalThis\.HNK\.__uxpForTests/.test(STORE) && /globalThis\.HNK\.__uxpForTests/.test(GSTORE) &&
    /ext === "mp4" \? "video\/mp4"/.test(GSTORE), null);

  report("A2) main.js hands every take to the store — vidGenerate (video, the folder button follows the copy), vtRun (v2v), mkTakes(pre, L, page) for talk and upscale; ✕ / Clear forget the record on all four; Download again reads this session's bytes or the copy (takesRefP) on Video · V→V · the mkTakes pages; takesRestoreP repaints the four strips at boot (after page-restore); HNK.openTake; the Video page's Open the folder opens the gallery folder",
    /takesRecordP\("video", vidHist\[0\]\)\.then\(function \(\) \{ const fo = \$\("btnVidFolder"\); if \(fo && vidHist\[vidHistSel\] && vidHist\[vidHistSel\]\.galleryFile\) fo\.style\.display = ""; \}\);/.test(MAIN) &&
    /takesRecordP\("v2v", vtHist\[0\]\);/.test(MAIN) && /T\.record = function \(e\) \{ T\.list\.unshift\(e\); while \(T\.list\.length > 12\) T\.list\.pop\(\); T\.sel = 0; try \{ T\.show\(\); \} catch \(x\) \{ \} takesRecordP\(page, e\); \};/.test(MAIN) &&
    /const tkTakes = mkTakes\("tk", TK_L, "talk"\);/.test(MAIN) && /const vuTakes = mkTakes\("vu", VU_L, "upscale"\);/.test(MAIN) &&
    /takesForgetP\(vidHist\.splice\(i, 1\)\[0\]\);/.test(MAIN) && /vidHist = \[\]; vidHistSel = 0; takesClearP\("video"\);/.test(MAIN) &&
    /takesForgetP\(vtHist\.splice\(i, 1\)\[0\]\);/.test(MAIN) && /takesClearP\("v2v"\);/.test(MAIN) &&
    /takesForgetP\(T\.list\.splice\(i, 1\)\[0\]\);/.test(MAIN) && /takesClearP\(page\);/.test(MAIN) &&
    count(MAIN, /await takesRefP\(out\)/g) === 4 /* 6.165.0 — vidSendTo (Send to Upscale / Video Tools) is the fourth reader */ && /async function takesRefP\(out\) \{\n\s*if \(out && out\.ref\) return out\.ref;/.test(MAIN) &&
    /const u = await ts\.readDataUrl\(out\); if \(u\) return u;/.test(MAIN) && /throw new Error\("no saved copy"\);/.test(MAIN) &&
    /async function takesRestoreP\(\)/.test(MAIN) && /vidHist = by\("video"\); vidHistSel = 0;/.test(MAIN) && /vtHist = by\("v2v"\); vtHistSel = 0;/.test(MAIN) &&
    /tkTakes\.list = by\("talk"\); tkTakes\.sel = 0;/.test(MAIN) && /vuTakes\.list = by\("upscale"\); vuTakes\.sel = 0;/.test(MAIN) &&
    MAIN.indexOf('safe("takes-restore", function () { takesRestoreP(); });') > MAIN.indexOf('safe("page-restore"') && MAIN.indexOf('safe("page-restore"') > 0 &&
    /g\.HNK\.openTake = takesOpenP;/.test(MAIN) && /function takesOpenP\(id\)/.test(MAIN) && /const TAKE_PAGE_KEY = \{ video: "video", v2v: "v2v", talk: "talk", upscale: "vidup" \};/.test(MAIN) &&
    /const fo = \$\("btnVidFolder"\); if \(fo\) fo\.style\.display = out\.galleryFile \? "" : "none";/.test(MAIN) &&
    /setIcnText\(\$\("btnVidFolder"\), "i-folder", "cream", ff9\(VT_L\.openFolder\)\);/.test(MAIN) &&
    /const vfo = \$\("btnVidFolder"\); if \(vfo\) vfo\.addEventListener\("click", function \(\) \{ takesOpenGalleryP\(\); \}\);/.test(MAIN) &&
    /<div role="button" tabindex="0" class="btn" id="btnVidFolder" style="display:none"><\/div>/.test(PHTML) &&
    /async function takesOpenGalleryP\(\) \{[\s\S]*?const p = await ts\.galleryPath\(\); if \(p\) await vtOpenFolder\(p\);/.test(MAIN), null);

  report("A3) the Gallery page lists an mp4 as a black MP4 · page · time tile (no thumbnail read), picked it offers Open the folder · Save · ★ · Delete and no IMAGE slots, galToSlot refuses a video, every delete path forgets the record (pick · selected · clear-all), the button sits between ★ and Delete, the tile rule is in styles.css",
    /function galIsVideo\(name\) \{ return \/\\\.mp4\$\/i\.test\(String\(name \|\| ""\)\); \}/.test(MAIN) && /function galVideoLabel\(name\)/.test(MAIN) &&
    /if \(galIsVideo\(f\.name\)\) return "";/.test(MAIN) && /tile\.className = "gal-vid" \+ \(\(\(GAL\.selMode && GAL\.sel\[f\.name\]\) \|\| GAL\.pick === f\.name\) \? " sel" : ""\);/.test(MAIN) &&
    /t1\.textContent = "MP4"; tile\.appendChild\(t1\);/.test(MAIN) && /t2\.className = "gal-vid-n"; t2\.textContent = galVideoLabel\(f\.name\);/.test(MAIN) && /ffPressable\(tile, onTap\);/.test(MAIN) &&
    /const isVid = galIsVideo\(f\.name\);/.test(MAIN) && /if \(im\) \{ im\.style\.display = isVid \? "none" : ""; if \(isVid\) im\.src = IMG_BLANK; \}/.test(MAIN) &&
    /if \(info\) info\.textContent = isVid \? \(galVideoLabel\(f\.name\) \+ " \\u00b7 " \+ f\.name\) : f\.name;/.test(MAIN) &&
    /if \(s1\) s1\.style\.display = isVid \? "none" : "";/.test(MAIN) && /if \(s2\) s2\.style\.display = isVid \? "none" : "";/.test(MAIN) &&
    /if \(fo\) \{ fo\.style\.display = isVid \? "" : "none"; setIcnText\(fo, "i-folder", "cream", ff9\(VT_L\.openFolder\)\); \}/.test(MAIN) &&
    /if \(!f \|\| galIsVideo\(f\.name\)\) \{ setStatus\(ff9\(GAL_L\.pickNone\), "err"\); return; \}/.test(MAIN) &&
    count(MAIN, /takesForgetFileP\((names\[i\]|f\.name|n)\);/g) === 3 &&
    /const gof = \$\("galOpenFolder"\); if \(gof\) gof\.addEventListener\("click", function \(\) \{ takesOpenGalleryP\(\); \}\);/.test(MAIN) &&
    PHTML.indexOf('id="galOpenFolder"') > PHTML.indexOf('id="galKeep"') && PHTML.indexOf('id="galOpenFolder"') < PHTML.indexOf('id="galDel"') &&
    /#pageGallery \.lib-grid \.gal-vid \{ width: 84px; height: 105px;/.test(CSS) && /#pageGallery \.lib-grid \.gal-vid \.gal-vid-n \{/.test(CSS) && /#pageGallery \.lib-grid \.gal-vid\.sel \{ border-color: var\(--accent\); \}/.test(CSS), null);

  const nineKeys = (key) => count(MAIN, new RegExp("^    " + key + ': "', "gm")) === 9;
  report("A4) History ▸ Videos: history-screen.js renderTakes lists every take (page badge · tool · resolution · length · time · file · prompt) with Open → HNK.openTake, in both the empty and the non-empty branch; ai_videos / ai_open in the nine languages (Videos / Open · ဗီဒီယိုများ / ဖွင့်)",
    /var TAKE_PAGE = \{ video: "Video", v2v: "V\\u2192V", talk: "Talking Photo", upscale: "Upscale" \};/.test(HSCREEN) && /function renderTakes\(root, deps\)/.test(HSCREEN) &&
    /dom\.t\("ai_videos", "Videos"\)/.test(HSCREEN) && /id: "hnkTakes"/.test(HSCREEN) && /id: "hnkTake_" \+ v\.id/.test(HSCREEN) && /id: "hnkTakeOpen_" \+ v\.id, text: dom\.t\("ai_open", "Open"\)/.test(HSCREEN) &&
    /globalThis\.HNK\.openTake\(v\.id\)/.test(HSCREEN) && count(HSCREEN, /renderTakes\(root, deps\);/g) === 2 && /var API = \{ render: render, renderTakes: renderTakes, TAKE_PAGE: TAKE_PAGE \};/.test(HSCREEN) &&
    nineKeys("ai_videos") && nineKeys("ai_open") && /^    ai_videos: "Videos",\n    ai_open: "Open",/m.test(MAIN) && /^    ai_videos: "ဗီဒီယိုများ",\n    ai_open: "ဖွင့်",/m.test(MAIN), null);

  const wn = (APP.match(/\{ v:"6\.87\.0", kind:"page", ref:"pgVideo",[\s\S]*?\} \},\n/) || [""])[0];
  const wnP = (WHATS.match(/\{ v:"6\.87\.0", kind:"page", ref:"pgVideo",[\s\S]*?\} \},\n/) || [""])[0];
  const tests = parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10);
  report("A5) CI runs this test right after verify_panel_video_takes; the landing counts at least 222 tests; What's New carries the 6.87.0 Video row in nine languages on the app and the panel",
    CI.indexOf("node test/verify_panel_video_takes_persist.js") > CI.indexOf("node test/verify_panel_video_takes.js") && CI.indexOf("node test/verify_panel_video_takes.js") > 0 && tests >= 222 &&
    !!wn && LANGS.every(l => (wn.match(new RegExp("(^|[,{])" + l + ':"', "g")) || []).length === 2) && !!wnP && wnP === wn,
    { tests, wn: wn.slice(0, 60), panelRow: !!wnP });

  /* ---------------- B. the store alone, in Node, over an in-memory data folder ---------------- */
  {
    const fx = eval(FAKE_FS_SRC);
    const gsLog = [];
    let saveN = 0;
    const gallery = new Map();
    const fakeGs = {
      save: async (b64, ext, label) => { const name = label + "-" + (1000 + (++saveN)) + "." + ext; gallery.set(name, b64); gsLog.push(["save", b64, ext, label]); return name; },
      remove: async (name) => { gsLog.push(["remove", name]); return gallery.delete(name); },
      readDataUrl: async (name) => gallery.has(name) ? "data:video/mp4;base64," + gallery.get(name) : ""
    };
    globalThis.HNK = { __uxpForTests: fx.uxp, galleryStore: fakeGs };
    const ts = require(path.join(PANEL, "src/app/takes-store.js"));

    const r1 = await ts.record({ page: "video", url: "http://x/1.mp4", ref: "data:video/mp4;base64," + CLIP_B64, prompt: "p".repeat(200), resolution: "1080p", duration: "5", ts: 1700000000000 });
    const idx1 = await fx.index();
    report("B1) record: the bytes go to the gallery store as (b64, \"mp4\", page), the record carries the copy's name, id <page>-<ts>, the prompt cut to 120, and the index file holds {v:1, takes:[…]}",
      gsLog.length === 1 && gsLog[0][0] === "save" && gsLog[0][1] === CLIP_B64 && gsLog[0][2] === "mp4" && gsLog[0][3] === "video" &&
      r1.galleryFile === "video-1001.mp4" && r1.id === "video-1700000000000" && r1.prompt.length === 120 && r1.url === "http://x/1.mp4" && r1.resolution === "1080p" && r1.duration === "5" &&
      ts.list("video").length === 1 && ts.list().length === 1 && fx.names().indexOf("hnk_video_takes.json") >= 0 &&
      idx1 && idx1.v === 1 && idx1.takes.length === 1 && idx1.takes[0].galleryFile === "video-1001.mp4", { r1, idx1, gsLog });

    for (let i = 0; i < 12; i++) await ts.record({ page: "video", ref: "data:video/mp4;base64," + CLIP_B64, ts: 1700000001000 + i });
    await ts.record({ page: "v2v", ref: "data:video/mp4;base64," + CLIP_B64, name: "hnk-videotool-1.mp4", tool: "Tool X", ts: 1700000002000 });
    const removed = gsLog.filter(x => x[0] === "remove").map(x => x[1]);
    report("B2) the cap is per page: the thirteenth video take drops the oldest (its copy removed from the gallery store), twelve stay newest-first, and the V→V take is untouched",
      ts.list("video").length === 12 && ts.list("v2v").length === 1 && ts.list().length === 13 && removed.join() === "video-1001.mp4" && !gallery.has("video-1001.mp4") &&
      ts.list("video")[0].ts === 1700000001011 && ts.list("video")[11].ts === 1700000001000 && (await fx.index()).takes.length === 13, { removed, n: ts.list("video").length });

    const before = ts.list("video")[5];
    const ok = await ts.remove(before.id);
    const fileGone = !gallery.has(before.galleryFile);
    const v2v = ts.list("v2v")[0];
    const forgot = await ts.forgetFile(v2v.galleryFile);
    const stillInGallery = gallery.has(v2v.galleryFile);
    await ts.record({ page: "talk", ref: "data:video/mp4;base64," + CLIP_B64, ts: 1700000003000 });
    await ts.record({ page: "talk", ref: "data:video/mp4;base64," + CLIP_B64, ts: 1700000003001 });
    const cleared = await ts.clear("talk");
    report("B3) remove(id) drops the record and its copy; forgetFile(name) drops the record only (the Gallery page deleted the file itself); clear(page) drops that page's takes and copies, the others stay",
      ok === true && fileGone && ts.list("video").length === 11 && !ts.list("video").some(e => e.id === before.id) &&
      forgot === 1 && ts.list("v2v").length === 0 && stillInGallery &&
      cleared === 2 && ts.list("talk").length === 0 && ts.list("video").length === 11 && gallery.size === 12 /* 11 video copies + the V→V one forgetFile left */, { ok, fileGone, forgot, cleared, size: gallery.size });

    const beforeReload = ts.list().map(e => e.id);
    ts._reset();
    const loaded = await ts.load();
    const again = await ts.load();
    const dataUrl = await ts.readDataUrl(ts.list("video")[0]);
    const gp = await ts.galleryPath();
    /* a foreign row in the file is skipped, a take without bytes still lands (no copy) */
    const f = await fx.root.createFile("hnk_video_takes.json", { overwrite: true });
    await f.write(JSON.stringify({ v: 1, takes: [{ page: "nope", id: "x" }, { page: "upscale", id: "u1", ts: 5, name: "hnk-upscaled-5.mp4" }, "junk"] }));
    ts._reset();
    const filtered = await ts.load();
    const noBytes = await ts.record({ page: "upscale", url: "http://x/u.mp4", ts: 9 });
    report("B4) after a reload load() reads the same takes back in the same order (once — a second load is the cache), readDataUrl hands the copy back as video/mp4, galleryPath is the data folder's gallery; a foreign row in the file is skipped, a take without bytes still lands with no copy",
      loaded.length === 11 && loaded.map(e => e.id).join() === beforeReload.join() && again.length === 11 && dataUrl === "data:video/mp4;base64," + CLIP_B64 && gp === "/tmp/hnkdata/gallery" &&
      filtered.length === 1 && filtered[0].id === "u1" && filtered[0].page === "upscale" && noBytes.galleryFile === "" && ts.list("upscale").length === 2 && ts.list("upscale")[0].id === "upscale-9",
      { n: loaded.length, dataUrl, gp, filtered, noBytes });

    /* no host at all: nothing throws, the strip still gets its take */
    globalThis.HNK.__uxpForTests = { storage: { localFileSystem: { getDataFolder: () => Promise.reject(new Error("no folder")) }, formats: { utf8: "utf8", binary: "binary" } } };
    ts._reset();
    const none = await ts.load();
    const rec = await ts.record({ page: "video", ref: "data:video/mp4;base64," + CLIP_B64, ts: 11 });
    report("B5) without a data folder nothing throws: load() is empty, record() still returns the entry for this session's strip, galleryPath is empty",
      none.length === 0 && rec && rec.id === "video-11" && ts.list("video").length === 1 && (await ts.galleryPath()) === "", { none, rec });
    delete globalThis.HNK;
  }

  /* ---------------- C. the panel, on a renderer that cannot play video (Photoshop), over an in-memory data folder ---------------- */
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const pb = await chromium.launch();
  let pan;
  try {
    const page = await pb.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.route("**/*", r => {
      const u = r.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return r.continue();
      if (r.request().resourceType() === "image")
        return r.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") });
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.addInitScript(UXP_STUB);
    await page.addInitScript("window.__fx = " + FAKE_FS_SRC + "; window.HNK = window.HNK || {}; window.HNK.__uxpForTests = window.__fx.uxp;");
    await page.addInitScript(() => { try { HTMLMediaElement.prototype.canPlayType = function () { return ""; }; } catch (e) { } });
    await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.waitForFunction(() => {
      try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; }
    }, null, { timeout: 20000 }).catch(() => { throw new Error("the panel never reached its signed-in state"); });
    pan = await page.evaluate(async arg => {
      const out = {};
      const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const until = f => new Promise(r => { const t0 = Date.now(); (function w() { if (f() || Date.now() - t0 > 10000) r(); else setTimeout(w, 40); })(); });
      const q = s => document.querySelectorAll(s);
      const txt = s => [...q(s)].map(n => n.textContent.trim());
      const shown = id => { const e = document.getElementById(id); return !!e && e.style.display !== "none"; };
      const on = id => /\bon\b/.test((document.getElementById(id) || {}).className || "");
      const fx = window.__fx;
      const TS = window.HNK.takesStore;
      const REF = "data:video/mp4;base64," + arg.b64;
      out.videoOk = VIDEO_OK;
      out.storeHooked = TS === window.HNK.takesStore && !!window.HNK.__uxpForTests;
      state.rhKey = state.rhKey || "TEST_RH_KEY";
      const V = window.HNK.runninghubVideo;
      window.__saved = [];
      saveResultFile = async function (folder, name, ref) { window.__saved.push({ folder: folder && folder.name, name, ref: String(ref) }); return name; };
      const ux = require("uxp"); ux.shell.openPath = function (p) { window.__folder = p; return Promise.resolve(); };
      openUrl = async function (u) { window.__opened = u; };
      pickFolder = async function () { return { name: "Renders", nativePath: "/tmp/Renders" }; };
      fileToDataUrl = async function () { return REF; };

      /* -- Video (the real vidGenerate over a stubbed provider) -- */
      switchPage("video"); await settle();
      const m = V.models().filter(x => !x.minImages && !x.down)[0];
      vidDef = function () { return m; };
      document.getElementById("vidPromptP").value = "a slow dolly through the studio";
      V.generate = async function () { await new Promise(r => setTimeout(r, 120)); return { ok: true, results: [{ ref: REF, url: arg.clip + "?video" }], usage: {} }; };
      await vidGenerate(); await settle();
      await until(() => vidHist[0] && vidHist[0].galleryFile); await settle();
      out.video = { model: m && m.id, tiles: txt("#vidHist .hvt"), boxOn: on("vidResultBox"), galleryFile: vidHist[0] && vidHist[0].galleryFile, id: vidHist[0] && vidHist[0].id,
        folderBtn: shown("btnVidFolder"), folderWord: document.getElementById("btnVidFolder").textContent.trim(), files: fx.gallery(), index: await fx.index() };
      window.__folder = null; document.getElementById("btnVidFolder").click(); await until(() => window.__folder); out.video.folderOpened = window.__folder;

      /* -- V→V (the real vtRun) -- */
      switchPage("v2v"); await settle();
      vtDef = function () { return { id: "tool-x", label: "Tool X", prompt: "opt" }; };
      VT.video = { name: "clip.mp4", _url: REF }; VT.out = { name: "Renders", nativePath: "/tmp/Renders" };
      V.runTool = async function () { await new Promise(r => setTimeout(r, 120)); return { ok: true, results: [{ ref: REF, url: arg.clip + "?v2v" }], usage: {} }; };
      await vtRun(); await settle();
      await until(() => vtHist[0] && vtHist[0].galleryFile); await settle();
      out.v2v = { tiles: txt("#vtHist .hvt"), galleryFile: vtHist[0] && vtHist[0].galleryFile, tool: vtHist[0] && vtHist[0].tool, name: vtHist[0] && vtHist[0].name };

      /* -- Talking Photo (the real tkRun) -- */
      switchPage("talk"); await settle();
      TK.img = { name: "face.png", _url: "data:image/png;base64," + arg.px }; TK.aud = { name: "voice.mp3", _url: "data:audio/mpeg;base64,AAAA" }; TK.out = { name: "Renders", nativePath: "/tmp/Renders" };
      renderTk(); await settle();
      V.runTalk = async function () { await new Promise(r => setTimeout(r, 120)); return { ok: true, results: [{ ref: REF, url: arg.clip + "?talk" }], usage: {} }; };
      document.getElementById("btnTkGen").click(); await settle();
      await until(() => !TK.busy); await until(() => tkTakes.list[0] && tkTakes.list[0].galleryFile); await settle();
      out.talk = { tiles: txt("#tkHist .hvt"), galleryFile: tkTakes.list[0] && tkTakes.list[0].galleryFile, name: tkTakes.list[0] && tkTakes.list[0].name };

      /* -- Video Upscale (the real vuRun) -- */
      switchPage("vidup"); await settle();
      VU.video = { name: "clip.mp4" }; VU.out = { name: "Renders", nativePath: "/tmp/Renders" };
      renderVu(); await settle();
      V.upscale = async function () { await new Promise(r => setTimeout(r, 120)); return { ok: true, results: [{ ref: REF, url: arg.clip + "?up" }], usage: {} }; };
      document.getElementById("btnVuRun").click(); await settle();
      await until(() => !VU.busy); await until(() => vuTakes.list[0] && vuTakes.list[0].galleryFile); await settle();
      out.upscale = { tiles: txt("#vuHist .hvt"), galleryFile: vuTakes.list[0] && vuTakes.list[0].galleryFile, name: vuTakes.list[0] && vuTakes.list[0].name };
      out.afterFour = { files: fx.gallery().slice().sort(), index: (await fx.index()).takes.map(e => e.page), storeN: TS.list().length };

      /* -- a reload: the strips are emptied, the store forgets its cache, boot's restore runs -- */
      const keepIds = { video: vidHist[0].id, v2v: vtHist[0].id, talk: tkTakes.list[0].id, upscale: vuTakes.list[0].id };
      vidHist = []; vidHistSel = 0; vtHist = []; vtHistSel = 0; tkTakes.list = []; tkTakes.sel = 0; vuTakes.list = []; vuTakes.sel = 0;
      ["vidHist", "vtHist", "tkHist", "vuHist"].forEach(id => { const h = document.getElementById(id); while (h.firstChild) h.removeChild(h.firstChild); });
      ["vidResultBox", "vtResultBox", "tkResultBox", "vuResultBox"].forEach(id => { document.getElementById(id).className = "card result-box"; });
      TS._reset();
      await settle();
      out.emptied = { tiles: txt("#vidHist .hvt").length + txt("#vtHist .hvt").length + txt("#tkHist .hvt").length + txt("#vuHist .hvt").length, boxes: ["vidResultBox", "vtResultBox", "tkResultBox", "vuResultBox"].filter(on).length };
      await takesRestoreP(); await settle();
      out.restored = { video: txt("#vidHist .hvt"), v2v: txt("#vtHist .hvt"), talk: txt("#tkHist .hvt"), upscale: txt("#vuHist .hvt"),
        boxes: ["vidResultBox", "vtResultBox", "tkResultBox", "vuResultBox"].filter(on).length,
        ids: { video: vidHist[0] && vidHist[0].id, v2v: vtHist[0] && vtHist[0].id, talk: tkTakes.list[0] && tkTakes.list[0].id, upscale: vuTakes.list[0] && vuTakes.list[0].id }, keepIds,
        noRef: [vidHist[0], vtHist[0], tkTakes.list[0], vuTakes.list[0]].every(e => e && !e.ref && e.galleryFile),
        vidTake: vidHist[0] && { url: vidHist[0].url, prompt: vidHist[0].prompt, resolution: vidHist[0].resolution, duration: vidHist[0].duration, galleryFile: vidHist[0].galleryFile },
        v2vSaved: document.getElementById("vtSavedLine").textContent, talkSaved: document.getElementById("tkSavedLine").textContent,
        vidFolderBtn: shown("btnVidFolder"), vidNote: document.getElementById("vidNoInline") && document.getElementById("vidNoInline").textContent };

      /* -- Download again after the reload reads the copy -- */
      switchPage("video"); await settle();
      window.__saved = [];
      await vidDownload(); await settle();
      out.dlVideo = window.__saved[0] && { folder: window.__saved[0].folder, name: window.__saved[0].name, ref: window.__saved[0].ref };
      switchPage("talk"); await settle();
      window.__saved = [];
      await tkTakes.download(); await settle();
      out.dlTalk = window.__saved[0] && { folder: window.__saved[0].folder, name: window.__saved[0].name, ref: window.__saved[0].ref };

      /* -- the Gallery page: four tiles, the pick box for a video -- */
      switchPage("gallery"); await settle();
      await until(() => q("#galGrid .gal-vid").length === 4); await settle();
      out.gal = { tiles: q("#galGrid .gal-vid").length, imgs: q("#galGrid img").length, words: txt("#galGrid .gal-vid").map(s => s.replace(/\s+/g, " ")), labels: txt("#galGrid .gal-vid .gal-vid-n"),
        pickShown: shown("galPick") };
      const talkTile = [...q("#galGrid .gal-vid")].find(t => /Talking Photo/.test(t.textContent));
      talkTile.click(); await settle();
      out.gal.pick = { shown: shown("galPick"), imgHidden: document.getElementById("galPickImg").style.display === "none", info: document.getElementById("galPickInfo").textContent,
        slot1: shown("galToImg1"), slot2: shown("galToImg2"), folder: shown("galOpenFolder"), folderWord: document.getElementById("galOpenFolder").textContent.trim(),
        save: shown("galDl"), keep: shown("galKeep"), del: shown("galDel"), sel: q("#galGrid .gal-vid.sel").length };
      window.__folder = null; document.getElementById("galOpenFolder").click(); await until(() => window.__folder); out.gal.pick.folderOpened = window.__folder;
      window.__galSaved = null;
      ux.storage.localFileSystem.getFolder = async () => ({ name: "Out", createFile: async (n) => ({ write: async (buf) => { window.__galSaved = { name: n, len: buf.byteLength || buf.length || 0 }; } }) });
      document.getElementById("galDl").click(); await until(() => window.__galSaved); await settle();
      out.gal.saved = window.__galSaved;
      await galToSlot(0); await settle();
      out.gal.slotRefused = { status: (document.getElementById("status") || {}).textContent, refs: state.refs.filter(Boolean).length };
      /* Delete on the picked video forgets the record too */
      const talkName = tkTakes.list[0].galleryFile;
      await galDeletePick(); await settle();
      await until(() => q("#galGrid .gal-vid").length === 3); await settle();
      out.gal.deleted = { tiles: q("#galGrid .gal-vid").length, fileGone: fx.gallery().indexOf(talkName) < 0, storeTalk: TS.list("talk").length, indexN: (await fx.index()).takes.length, pickShown: shown("galPick") };

      /* -- History ▸ Videos -- */
      switchPage("aitools"); await settle();
      window.HNK.aiToolsApp.navigate("history"); await settle();
      out.hist = { section: txt("#pageAiTools .hnk-sec"), rows: q("#hnkTakes .hnk-hist").length, badges: txt("#hnkTakes .hnk-hist-badge"), metas: txt("#hnkTakes .hnk-hist-meta"),
        prompts: txt("#hnkTakes .hnk-hist-prompt"), openWords: [...new Set(txt("#hnkTakes .hnk-btn"))] };
      const v2vId = vtHist[0].id;
      document.getElementById("hnkTakeOpen_" + v2vId).click(); await settle();
      out.hist.opened = { page: state.page, sel: vtHistSel, boxOn: on("vtResultBox"), selTile: txt("#vtHist .hvt.sel") };

      /* -- ✕ on the Video strip drops the copy with the record -- */
      switchPage("video"); await settle();
      const vidName = vidHist[0].galleryFile;
      document.querySelector("#vidHist .hx").click(); await settle();
      await until(() => fx.gallery().indexOf(vidName) < 0); await settle();
      out.removed = { tiles: txt("#vidHist .hvt"), boxOn: on("vidResultBox"), fileGone: fx.gallery().indexOf(vidName) < 0, storeVideo: TS.list("video").length, indexN: (await fx.index()).takes.length, files: fx.gallery().slice().sort() };
      return out;
    }, { px: PX, b64: CLIP_B64, clip: "http://127.0.0.1:" + port + "/x.mp4" });
    pan.errs = errs;
  } finally { await pb.close(); server.close(); }

  const VD = pan.video, R = pan.restored, G = pan.gal, H = pan.hist;
  report("C1) panel · Video: the real vidGenerate records the take, the copy lands in the gallery folder as video-<ts>.mp4 and the index holds it, the strip shows MP4 1, Open the folder comes on and opens the gallery folder (shell.openPath)",
    pan.videoOk === false && pan.storeHooked && !!VD.model && VD.tiles.join() === "MP4 1" && VD.boxOn && /^video-\d+\.mp4$/.test(VD.galleryFile) && /^video-\d+$/.test(VD.id) &&
    VD.files.join() === VD.galleryFile && VD.index && VD.index.takes.length === 1 && VD.index.takes[0].galleryFile === VD.galleryFile &&
    VD.folderBtn && VD.folderWord === "Folder ဖွင့်မယ်" && VD.folderOpened === "/tmp/hnkdata/gallery", VD);
  report("C2) panel · V→V, Talking Photo and Upscale record through the store too — v2v-…, talk-…, upscale-… copies, four files, four index rows",
    /^v2v-\d+\.mp4$/.test(pan.v2v.galleryFile) && pan.v2v.tool === "Tool X" && /^hnk-videotool-\d+\.mp4$/.test(pan.v2v.name) && pan.v2v.tiles.join() === "MP4 1" &&
    /^talk-\d+\.mp4$/.test(pan.talk.galleryFile) && /^hnk-talking-photo-\d+\.mp4$/.test(pan.talk.name) && /^upscale-\d+\.mp4$/.test(pan.upscale.galleryFile) && /^hnk-upscaled-\d+\.mp4$/.test(pan.upscale.name) &&
    pan.afterFour.files.length === 4 && pan.afterFour.index.slice().sort().join() === "talk,upscale,v2v,video" && pan.afterFour.storeN === 4, { v2v: pan.v2v, talk: pan.talk, upscale: pan.upscale, afterFour: pan.afterFour });
  report("C3) panel · after a reload (strips emptied, store cache dropped) takesRestoreP paints all four strips and boxes back from the index — same ids, no in-memory bytes but a copy each, the Video take's url · prompt · resolution · duration, the saved lines, the folder button, the clip-1 note",
    pan.emptied.tiles === 0 && pan.emptied.boxes === 0 && R.video.join() === "MP4 1" && R.v2v.join() === "MP4 1" && R.talk.join() === "MP4 1" && R.upscale.join() === "MP4 1" && R.boxes === 4 &&
    JSON.stringify(R.ids) === JSON.stringify(R.keepIds) && R.noRef && /\?video$/.test(R.vidTake.url) && R.vidTake.prompt === "a slow dolly through the studio" && R.vidTake.resolution.length > 0 && R.vidTake.duration.length > 0 &&
    /Renders\/hnk-videotool-\d+\.mp4/.test(R.v2vSaved) && /Renders\/hnk-talking-photo-\d+\.mp4/.test(R.talkSaved) && R.vidFolderBtn && /1/.test(String(R.vidNote)), { emptied: pan.emptied, R });
  report("C4) panel · Download again after the reload reads the copy back: Video and Talk both write the original bytes as video/mp4 into the picked folder",
    pan.dlVideo && pan.dlVideo.folder === "Renders" && /^hnk-video-.*\.mp4$/.test(pan.dlVideo.name) && pan.dlVideo.ref === "data:video/mp4;base64," + CLIP_B64 &&
    pan.dlTalk && pan.dlTalk.folder === "Renders" && /^hnk-talking-photo-\d+\.mp4$/.test(pan.dlTalk.name) && pan.dlTalk.ref === "data:video/mp4;base64," + CLIP_B64, { dlVideo: pan.dlVideo, dlTalk: pan.dlTalk });
  report("C5) panel · Gallery: four MP4 tiles (page · time, no <img>), picking the Talking Photo one shows the pick box with no picture, its label · file, Open the folder (→ the gallery folder) · Save (writes the copy's 12 bytes) · ★ · Delete and no IMAGE slots; IMAGE 1 refuses a video; Delete removes the file, the record and the index row",
    G.tiles === 4 && G.imgs === 0 && G.words.every(w => /^MP4(Video|V\u2192V|Talking Photo|Upscale) \u00b7 /.test(w)) /* the MP4 line, then the page line */ && G.labels.map(l => l.split(" \u00b7 ")[0]).sort().join("|") === "Talking Photo|Upscale|Video|V\u2192V" /* code-unit order: → sorts after i */ &&
    G.labels.every(l => /\u00b7 \d\d:\d\d$/.test(l)) && !G.pickShown &&
    G.pick.shown && G.pick.imgHidden && /^Talking Photo \u00b7 \d\d:\d\d \u00b7 talk-\d+\.mp4$/.test(G.pick.info) && !G.pick.slot1 && !G.pick.slot2 && G.pick.folder && G.pick.folderWord === "Folder ဖွင့်မယ်" &&
    G.pick.save && G.pick.keep && G.pick.del && G.pick.sel === 1 && G.pick.folderOpened === "/tmp/hnkdata/gallery" && G.saved && /^talk-\d+\.mp4$/.test(G.saved.name) && G.saved.len === 12 &&
    G.slotRefused.refs === 0 && G.deleted.tiles === 3 && G.deleted.fileGone && G.deleted.storeTalk === 0 && G.deleted.indexN === 3 && !G.deleted.pickShown, G);
  report("C6) panel · History ▸ ဗီဒီယိုများ: three rows (the deleted Talk take is gone) with page badges, tool · resolution · length · time · file on the meta line, the Video prompt, ဖွင့် buttons; Open on the V→V row goes to the V→V page with that take selected",
    H.section.indexOf("ဗီဒီယိုများ") >= 0 && H.rows === 3 && H.badges.join() === "Upscale,V\u2192V,Video" /* newest first; the Talk take was deleted on the Gallery page */ &&
    H.metas.some(m => /Tool X \u00b7 \d\d:\d\d \u00b7 hnk-videotool-\d+\.mp4/.test(m)) && H.metas.some(m => /^Video Upscale \u00b7 /.test(m) && /hnk-upscaled-\d+\.mp4$/.test(m)) &&
    H.metas.some(m => /^\d+p \u00b7 \d+s \u00b7 \d\d:\d\d$/.test(m)) && H.prompts.indexOf("a slow dolly through the studio") >= 0 && H.openWords.join() === "ဖွင့်" &&
    H.opened.page === "v2v" && H.opened.sel === 0 && H.opened.boxOn && H.opened.selTile.join() === "MP4 1", H);
  report("C7) panel · ✕ on the Video strip drops the copy with the record: the file is gone from the gallery folder, the store and the index have no video take, the box closes",
    pan.removed.tiles.length === 0 && !pan.removed.boxOn && pan.removed.fileGone && pan.removed.storeVideo === 0 && pan.removed.indexN === 2 && pan.removed.files.length === 2 &&
    pan.removed.files.every(f => /^(v2v|upscale)-\d+\.mp4$/.test(f)), pan.removed);
  report("C8) panel · no page error", pan.errs.length === 0, pan.errs.slice(0, 3));

  console.log(failures ? "\n" + failures + " check(s) failed." : "\nALL PASS — the four video strips come back after a reload, the Gallery lists the copies, and History has a Videos section.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
