/* verify_panel_place_result.js — 6.100.0 / panel 6.171.0
   THE RUN THAT FINISHED AND THEN REFUSED.

   The owner photographed a Smart Workflow run in Photoshop ending in a red
   box: "ဖန်တီးပြီးပါပြီ။ ဒါပေမယ့် Photoshop ထဲ ထည့်၍ မရပါ။ Document တစ်ခု
   ဖွင့်ပြီး History ကနေ ပြန်လုပ်ပါ။ · place-failed" — with a document plainly
   open in the Layers panel (an "HNK — Selection Edit" group from an earlier
   run sitting in it), and with the message: "အစပိုင်းရတယ် နောက်ပိုင်း ဒီလိုပေါ်လာတယ်"
   — it worked at first, later this appeared.

   The picture had been generated and paid for. Three things were wrong on the
   wizard's place path, and every one of them is a difference between it and
   Freeform's place (main.js placeResultToPS), which has never failed this way:

     1. IT KEPT NO REASON. photoshop-host.placeAsLayer returned a bare `null`
        from six branches; masked-place-service flattened that into
        { ok:false } with no reason field at all; bootstrap printed its own
        fallback word. "place-failed" in the photograph is that fallback —
        it names nothing, so nobody could act on it.
     2. IT WROTE INTO A DIFFERENT FOLDER. It asked for getTemporaryFolder()
        first. The path that works asks for getDataFolder(). A session token
        is only as good as the file it was minted for, and the temporary
        folder is the host's to clear.
     3. IT REUSED ONE FILENAME FOR EVERY RUN — hnk_aitools_place.png,
        overwritten while Photoshop may still hold the previous one. That is
        a fault shaped exactly like the report: it spares the first run and
        takes a later one.

   What this test pins:
     A  the source: data folder first, one file per place with a sweep, a
        retry, every exit carrying a reason, the service carrying it up, the
        new-document branch, the SELF-TEST row wired in three places.
     B  the service over fake hosts: a named refusal survives to the caller,
        a bare null still reads "place-failed", legacy success shapes still
        pass, and a new document is not reported as "mask unavailable".
     C  the real photoshop-host module under a fake UXP + Photoshop: a place
        writes ONE uniquely named file into the DATA folder; the sweep keeps
        the newest; a first failure is retried and the second try wins; two
        failures return what Photoshop actually said; no document opens one;
        a refused session token names itself.
     D  fault injection: put the bare nulls back and C must go red.
     E  the CI step exists.

   Fault-injected while writing: restoring `return null` in placeAsLayer turns
   C3/C4 red; restoring getTemporaryFolder() first turns C1 red; restoring the
   fixed filename turns C2 red. */
"use strict";
const fs = require("fs");
const path = require("path");
const Module = require("module");

const ROOT = path.join(__dirname, "..");
const HOST_JS = path.join(ROOT, "panel", "src", "photoshop", "photoshop-host.js");
const MPS_JS = path.join(ROOT, "panel", "src", "photoshop", "masked-place-service.js");
const BOOT_JS = path.join(ROOT, "panel", "src", "app", "bootstrap.js");
const MAIN_JS = path.join(ROOT, "panel", "main.js");
const WORKFLOW = path.join(ROOT, ".github", "workflows", "test.yml");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 700)));
  if (!ok) failures++;
}
/* comments are prose, not contract — pin the code */
function code(src) { return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " "); }

const hostSrc = fs.readFileSync(HOST_JS, "utf8");
const mpsSrc = fs.readFileSync(MPS_JS, "utf8");
const bootSrc = fs.readFileSync(BOOT_JS, "utf8");
const mainSrc = fs.readFileSync(MAIN_JS, "utf8");
const hostCode = code(hostSrc), mpsCode = code(mpsSrc), bootCode = code(bootSrc), mainCode = code(mainSrc);

/* ================= A — the source says what it does ================= */
(function A() {
  const iData = hostCode.indexOf("getDataFolder()");
  const iTmp = hostCode.indexOf("getTemporaryFolder()", hostCode.indexOf("async function placeAsLayer"));
  const place = hostCode.slice(hostCode.indexOf("async function placeAsLayer"));
  report("A1 the place asks for the data folder before the temporary one",
    place.indexOf("getDataFolder()") >= 0 && place.indexOf("getDataFolder()") < place.indexOf("getTemporaryFolder()"),
    { data: place.indexOf("getDataFolder()"), tmp: place.indexOf("getTemporaryFolder()"), iData, iTmp });

  report("A2 every place writes its own file, and the old ones are swept",
    /var PLACE_TMP = "hnk_place_";/.test(hostCode)
    && /PLACE_TMP \+ Date\.now\(\)/.test(hostCode)
    && /getEntries/.test(hostCode) && /\.delete\(\)/.test(hostCode)
    && hostCode.indexOf("hnk_aitools_place") < 0,
    { fixedNameStillThere: hostCode.indexOf("hnk_aitools_place") >= 0 });

  report("A3 a refusal is retried once on a freshly written file",
    /for \(var attempt = 0; attempt < 2; attempt\+\+\)/.test(hostCode), {});

  /* no branch of the place may answer a bare null any more */
  const placeBody = hostCode.slice(hostCode.indexOf("async function placeAsLayer"), hostCode.indexOf("var API = {"));
  const onceBody = hostCode.slice(hostCode.indexOf("async function _placeOnce"), hostCode.indexOf("async function placeAsLayer"));
  report("A4 no branch of the place returns a bare null",
    !/return null;/.test(placeBody) && !/return null;/.test(onceBody),
    { place: /return null;/.test(placeBody), once: /return null;/.test(onceBody) });

  report("A5 every refusal carries one line of why",
    (placeBody.match(/reason:/g) || []).length >= 6 && /_emsg\(e\)/.test(onceBody),
    { reasons: (placeBody.match(/reason:/g) || []).length });

  report("A6 the service keeps the host's reason and hands it up",
    /placed\.ok !== false/.test(mpsCode) && /reason: okOne \? "" :/.test(mpsCode) && /res\.reason = seen\.join/.test(mpsCode), {});

  report("A7 a document opened for the result is not called a missing mask",
    /if \(placeResult\.newDoc\) return "new-document";/.test(mpsCode)
    && /newDoc: anyNewDoc/.test(mpsCode)
    && (bootCode.match(/placed\.outcome === "new-document"/g) || []).length === 2
    && (bootCode.match(/st_new_doc/g) || []).length === 2,
    { mps: /newDoc: anyNewDoc/.test(mpsCode), boot: (bootCode.match(/st_new_doc/g) || []).length });

  report("A8 the SELF-TEST carries a Place row — listed, on Setup, and on Run again",
    /rows\.push\(hnkPlaceProbeRow\(\)\);/.test(mainCode)
    && /hnkPlaceProbeStart\(false\)/.test(mainCode)
    && /hnkPlaceProbeStart\(true\)/.test(mainCode)
    && /function hnkPlaceProbeStart/.test(mainCode), {});

  report("A9 the Place row undoes what it placed, is throttled, and refuses without a document",
    /HNK: remove self-test layer/.test(mainCode)
    && /no document open/.test(mainCode)
    && /placeProbe\.state === "running"/.test(mainCode)
    && /now - placeProbe\.at < 60000/.test(mainCode)
    && /hostIsPhotoshop\(\)/.test(mainCode.slice(mainCode.indexOf("function hnkPlaceProbeStart"), mainCode.indexOf("function hnkPlaceProbeRow"))),
    {});

  report("A10 the probe picture is a real 2×2 PNG",
    (function () {
      const m = /PLACE_PROBE_PNG = "data:image\/png;base64,([A-Za-z0-9+/=]+)"/.exec(mainCode);
      if (!m) return false;
      const b = Buffer.from(m[1], "base64");
      if (b.length < 40) return false;
      if (b.slice(0, 8).toString("hex") !== "89504e470d0a1a0a") return false;
      if (b.readUInt32BE(16) !== 2 || b.readUInt32BE(20) !== 2) return false;
      const zlib = require("zlib");
      let off = 8, ok = false;
      while (off < b.length) {
        const len = b.readUInt32BE(off), typ = b.slice(off + 4, off + 8).toString();
        if (typ === "IDAT") { try { zlib.inflateSync(b.slice(off + 8, off + 8 + len)); ok = true; } catch (e) { return false; } }
        off += 12 + len;
      }
      return ok;
    })(), {});
})();

/* ================= B — the service over fake hosts ================= */
async function B() {
  delete require.cache[require.resolve(MPS_JS)];
  const mps = require(MPS_JS);
  const one = [{ ref: "data:image/png;base64,AA", width: 10, height: 10 }];
  const deps = (host) => ({ host: host, results: one, feature: "Reference Scenes", canvas: { width: 100, height: 100 } });

  const named = await mps.placeResults(deps({
    placeAsLayer: async () => ({ ok: false, reason: "Photoshop refused a token for the file — EBUSY" }),
    createGroup: async () => ({ id: 1 }), supportsLayerMask: () => true
  }));
  report("B1 a refusal the host names reaches the caller word for word",
    named.ok === false && named.reason === "Photoshop refused a token for the file — EBUSY" && named.outcome === "failed",
    named);

  const bare = await mps.placeResults(deps({
    placeAsLayer: async () => null, createGroup: async () => null, supportsLayerMask: () => false
  }));
  report("B2 a host that still answers a bare null is reported, not crashed",
    bare.ok === false && bare.reason === "place-failed", bare);

  const threw = await mps.placeResults(deps({
    placeAsLayer: async () => { throw new Error("Could not complete the Place command"); },
    createGroup: async () => ({ id: 1 }), supportsLayerMask: () => true
  }));
  report("B3 a throw becomes the reason, not a silent failure",
    threw.ok === false && /Could not complete the Place command/.test(threw.reason || ""), threw);

  const legacy = await mps.placeResults(deps({
    placeAsLayer: async () => ({ id: 7, placed: true, masked: true }),
    createGroup: async () => ({ id: 1 }), supportsLayerMask: () => true
  }));
  report("B4 a plain success shape is still a masked group",
    legacy.ok === true && legacy.outcome === "masked-group" && !legacy.reason, legacy);

  const nd = await mps.placeResults(deps({
    placeAsLayer: async () => ({ placed: true, newDoc: true }),
    createGroup: async () => null, supportsLayerMask: () => true
  }));
  report("B5 a result opened as its own document says so",
    nd.ok === true && nd.outcome === "new-document" && nd.newDoc === true, nd);

  const noHost = await mps.placeResults({ host: {}, results: one, feature: "T", canvas: { width: 1, height: 1 } });
  report("B6 no host is still 'no-host'", noHost.ok === false && noHost.reason === "no-host", noHost);
}

/* ================= C — the real host under a fake Photoshop ================= */
const PNG2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGO4st78ynpzBggFADLaBuk2gZvtAAAAAElFTkSuQmCC";

function fakeFolder(label) {
  const ents = new Map();
  return {
    _label: label, _ents: ents, nativePath: "/fake/" + label,
    getEntries: async () => Array.from(ents.values()),
    createFile: async (n) => {
      const f = { name: n, isFile: true, _bytes: null, _deleted: false,
        write: async (buf) => { f._bytes = Buffer.from(new Uint8Array(buf)); },
        delete: async () => { f._deleted = true; ents.delete(n); } };
      ents.set(n, f); return f;
    },
    _seed: (n) => { ents.set(n, { name: n, isFile: true, _deleted: false, delete: async () => { ents.get(n)._deleted = true; ents.delete(n); } }); }
  };
}

function loadHost(uxp, ps) {
  const realLoad = Module._load;
  Module._load = function (req, parent, isMain) {
    if (req === "uxp") { if (!uxp) throw new Error("no uxp"); return uxp; }
    if (req === "photoshop") { if (!ps) throw new Error("no photoshop"); return ps; }
    return realLoad.apply(this, arguments);
  };
  try {
    delete require.cache[require.resolve(HOST_JS)];
    return require(HOST_JS);
  } finally { Module._load = realLoad; }
}
/* the fake host has to stay installed while the async place runs */
function withModules(uxp, ps, fn) {
  const realLoad = Module._load;
  Module._load = function (req) {
    if (req === "uxp") { if (!uxp) throw new Error("no uxp"); return uxp; }
    if (req === "photoshop") { if (!ps) throw new Error("no photoshop"); return ps; }
    return realLoad.apply(this, arguments);
  };
  return Promise.resolve().then(fn).then(
    (v) => { Module._load = realLoad; return v; },
    (e) => { Module._load = realLoad; throw e; });
}

function fakePs(opts) {
  opts = opts || {};
  let placeCalls = 0;
  const layer = { id: 42, name: "", bounds: { left: 0, top: 0, right: 2, bottom: 2 },
    scale: async () => { }, translate: async () => { }, move: async () => { } };
  const doc = { width: 100, height: 100, activeLayers: [layer] };
  const ps = {
    _placeCalls: () => placeCalls, _opened: [],
    app: { documents: opts.noDoc ? [] : [doc], activeDocument: doc,
      open: async (f) => { ps._opened.push(f); return doc; } },
    core: { executeAsModal: async (fn, o) => fn({}, o) },
    action: { batchPlay: async (seq) => {
      if (seq && seq[0] && seq[0]._obj === "placeEvent") {
        placeCalls++;
        if (opts.failPlaces && placeCalls <= opts.failPlaces) throw new Error(opts.placeErr || "Could not complete the Place command because of a program error");
      }
      return [];
    } },
    constants: { AnchorPosition: { MIDDLECENTER: 1 }, ElementPlacement: { PLACEINSIDE: 2 } }
  };
  return ps;
}
function fakeUxp(folder, opts) {
  opts = opts || {};
  return { storage: {
    formats: { binary: "binary", utf8: "utf8" },
    localFileSystem: {
      getDataFolder: async () => { if (opts.noData) throw new Error("no data folder"); return folder; },
      getTemporaryFolder: async () => { if (opts.noTmp) throw new Error("no temp folder"); return opts.tmpFolder || folder; },
      createSessionToken: (f) => { if (opts.tokenThrows) throw new Error("token refused: " + opts.tokenThrows); return "token:" + f.name; }
    } } };
}

async function C() {
  /* C1 — one place: the DATA folder, one uniquely named file, a real layer */
  {
    const data = fakeFolder("data"), tmp = fakeFolder("tmp");
    const uxp = fakeUxp(data, { tmpFolder: tmp }), ps = fakePs({});
    const host = loadHost(uxp, ps);
    const out = await withModules(uxp, ps, () => host.placeAsLayer({ ref: PNG2, name: "HNK · one", bounds: null, group: null, mask: false }));
    const names = Array.from(data._ents.keys());
    report("C1 a place writes one uniquely named file into the DATA folder and lands a layer",
      !!(out && out.placed) && names.length === 1 && /^hnk_place_\d+_\d+\.png$/.test(names[0])
      && Array.from(tmp._ents.keys()).length === 0 && ps._placeCalls() === 1,
      { out: out, names: names, tmp: Array.from(tmp._ents.keys()), calls: ps._placeCalls() });
  }

  /* C2 — the sweep: older place files go, the newest are kept, and no name is reused */
  {
    const data = fakeFolder("data");
    ["hnk_place_1_1.png", "hnk_place_2_2.png", "hnk_place_3_3.png", "hnk_place_4_4.png", "keep_me.json"].forEach(data._seed);
    const uxp = fakeUxp(data), ps = fakePs({});
    const host = loadHost(uxp, ps);
    await withModules(uxp, ps, () => host.placeAsLayer({ ref: PNG2, name: "x", bounds: null, group: null, mask: false }));
    const names = Array.from(data._ents.keys());
    const olds = names.filter((n) => /^hnk_place_[1-4]_/.test(n));
    report("C2 the older place files are swept, the newest kept, nothing else touched",
      olds.length === 2 && names.indexOf("keep_me.json") >= 0 && names.filter((n) => /^hnk_place_\d{6,}/.test(n)).length === 1,
      { names: names });
  }

  /* C3 — the first place fails, the second wins: the student never sees it */
  {
    const data = fakeFolder("data");
    const uxp = fakeUxp(data), ps = fakePs({ failPlaces: 1 });
    const host = loadHost(uxp, ps);
    const out = await withModules(uxp, ps, () => host.placeAsLayer({ ref: PNG2, name: "x", bounds: null, group: null, mask: false }));
    const names = Array.from(data._ents.keys());
    report("C3 a first refusal is retried on a fresh file and the second try lands",
      !!(out && out.placed) && ps._placeCalls() === 2 && names.length === 2,
      { out: out, calls: ps._placeCalls(), names: names });
  }

  /* C4 — both fail: the student is told what Photoshop said, never "place-failed" */
  {
    const data = fakeFolder("data");
    const uxp = fakeUxp(data), ps = fakePs({ failPlaces: 9, placeErr: "Could not complete the Place command because the file is in use" });
    const host = loadHost(uxp, ps);
    const out = await withModules(uxp, ps, () => host.placeAsLayer({ ref: PNG2, name: "x", bounds: null, group: null, mask: false }));
    report("C4 two refusals answer with Photoshop's own sentence",
      !!out && out.ok === false && /file is in use/.test(out.reason || "") && out.reason !== "place-failed" && ps._placeCalls() === 2,
      out);

    /* and it survives the service unchanged — this is the sentence the owner's red box would now carry */
    delete require.cache[require.resolve(MPS_JS)];
    const mps = require(MPS_JS);
    const r = await withModules(uxp, ps, () => mps.placeResults({
      host: host, results: [{ ref: PNG2, width: 2, height: 2 }], feature: "Reference Scenes", canvas: { width: 100, height: 100 }
    }));
    report("C5 the service prints that sentence instead of the word 'place-failed'",
      r.ok === false && /file is in use/.test(r.reason || ""), { reason: r.reason });
  }

  /* C6 — no document: the result is opened as its own, never thrown away */
  {
    const data = fakeFolder("data");
    const uxp = fakeUxp(data), ps = fakePs({ noDoc: true });
    const host = loadHost(uxp, ps);
    const out = await withModules(uxp, ps, () => host.placeAsLayer({ ref: PNG2, name: "x", bounds: null, group: null, mask: false }));
    report("C6 with no document open the result becomes its own document",
      !!(out && out.placed) && out.newDoc === true && ps._opened.length === 1 && ps._placeCalls() === 0,
      { out: out, opened: ps._opened.length });
  }

  /* C7 — a refused session token names itself */
  {
    const data = fakeFolder("data");
    const uxp = fakeUxp(data, { tokenThrows: "EPERM" }), ps = fakePs({});
    const host = loadHost(uxp, ps);
    const out = await withModules(uxp, ps, () => host.placeAsLayer({ ref: PNG2, name: "x", bounds: null, group: null, mask: false }));
    report("C7 a refused session token is named, not swallowed",
      !!out && out.ok === false && /token/i.test(out.reason || "") && /EPERM/.test(out.reason || ""), out);
  }

  /* C8 — no folder at all, and a picture that is not a picture */
  {
    const uxp = fakeUxp(null, { noData: true, noTmp: true }), ps = fakePs({});
    const host = loadHost(uxp, ps);
    const out = await withModules(uxp, ps, () => host.placeAsLayer({ ref: PNG2, name: "x", bounds: null, group: null, mask: false }));
    report("C8 no folder to write into says exactly that",
      !!out && out.ok === false && /no folder to write the picture into/.test(out.reason || ""), out);

    const data = fakeFolder("data");
    const uxp2 = fakeUxp(data), ps2 = fakePs({});
    const host2 = loadHost(uxp2, ps2);
    const bad = await withModules(uxp2, ps2, () => host2.placeAsLayer({ ref: "not a data url", name: "x" }));
    report("C9 a result that is not a picture says so",
      !!bad && bad.ok === false && /decode/.test(bad.reason || ""), bad);
  }

  /* C10 — the bytes written are the picture, not something larger */
  {
    const data = fakeFolder("data");
    const uxp = fakeUxp(data), ps = fakePs({});
    const host = loadHost(uxp, ps);
    await withModules(uxp, ps, () => host.placeAsLayer({ ref: PNG2, name: "x", bounds: null, group: null, mask: false }));
    const f = Array.from(data._ents.values())[0];
    const want = Buffer.from(PNG2.split(",")[1], "base64");
    report("C10 the file on disk is exactly the picture that was generated",
      !!(f && f._bytes) && f._bytes.length === want.length && f._bytes.equals(want),
      { wrote: f && f._bytes && f._bytes.length, want: want.length });
  }
}

/* ================= D — fault injection ================= */
async function D() {
  /* put the old shape back in a copy of the service and prove B1 would go red */
  const broken = mpsSrc
    .replace('var okOne = !!(placed && placed.ok !== false);', 'var okOne = !!placed;')
    .replace(/if \(!anyOk\) \{[\s\S]*?\n  \}\n/, "");
  const tmpFile = path.join(require("os").tmpdir(), "hnk_mps_broken_" + Date.now() + ".js");
  fs.writeFileSync(tmpFile, broken);
  let stillNamed = true;
  try {
    const bad = require(tmpFile);
    const r = await bad.placeResults({
      host: { placeAsLayer: async () => ({ ok: false, reason: "EBUSY" }), createGroup: async () => null, supportsLayerMask: () => false },
      results: [{ ref: "data:image/png;base64,AA", width: 2, height: 2 }], feature: "T", canvas: { width: 9, height: 9 }
    });
    stillNamed = !!(r && r.ok === false && r.reason === "EBUSY");
  } catch (e) { stillNamed = false; }
  finally { try { fs.unlinkSync(tmpFile); } catch (e) { } }
  report("D1 with the old flattening back, the reason is lost — the test can tell",
    stillNamed === false, { stillNamed: stillNamed });
}

/* ================= E — the release ================= */
(function E() {
  const wf = fs.readFileSync(WORKFLOW, "utf8");
  report("E1 CI runs this test", wf.indexOf("node test/verify_panel_place_result.js") >= 0, {});
})();

(async function main() {
  await B();
  await C();
  await D();
  console.log("");
  if (failures) { console.log(failures + " FAILURE(S)"); process.exit(1); }
  console.log("All checks passed — a place that cannot happen says why, and happens anyway when it can.");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
