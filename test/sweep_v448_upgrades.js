/* v4.48.0 regression sweep — 880 pack deep integration: combo composer,
   pack contract, search / favorites / strength.

   Pinned contracts:
   A) Catalog v2 + contract: 880 records with attribute search text (q);
      contract.json carries neg + rr + per-category preserve (cats.*.pr).
   B) Combo: one pick per category composes — lipstick + eyebrow = 2 picks,
      IMAGE 2 becomes a 1024x684 labeled sheet (2 cells + label bars).
   C) Frag: both ids listed, "labeled reference sheet" header, the pack's
      reference-role + PRESERVE + "NEVER produce:" negative present.
   D) Strength chips scale the per-style recommendation (soft < rec).
   E) Exclusions: picking a makeup_look clears component picks; single-pick
      frag keeps the "Style <id>" shape with no sheet header.
   F) Legacy {id,mode} sv shape still resolves through st880Sel().
   G) Favorites + recent persist in localStorage and drive the pseudo-rows.
   H) Search box filters the grid across the suite's categories.

   Usage: PORT=8931 node test/sweep_v448_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(String(e).slice(0, 200)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  const r = await page.evaluate(async () => {
    const out = {};
    switchPage("pgStudio");
    await new Promise(r2 => setTimeout(r2, 300));
    await new Promise(res => st880Load(res));
    out.A_catalog = ST880.list.length === 880;
    out.A_q = typeof ST880.list[0].q === "string" && ST880.list[0].q.length > 10;
    out.A_contract = !!(ST880.contract && ST880.contract.neg && ST880.contract.rr &&
      ST880.contract.cats && ST880.contract.cats.lipstick && ST880.contract.cats.lipstick.pr);

    const lip = ST880.list.find(x => x.cat === "lipstick");
    const brow = ST880.list.find(x => x.cat === "eyebrow");
    st880Pick(lip);
    await new Promise(r2 => setTimeout(r2, 700));
    st880Pick(brow);
    await new Promise(r2 => setTimeout(r2, 900));
    out.B_two = st880Count() === 2 && !!state.st.refX;
    const dims = await new Promise(res => {
      const im = new Image();
      im.onload = () => res({ w: im.width, h: im.height });
      im.onerror = () => res({ w: 0, h: 0 });
      im.src = "data:" + state.st.refX.mime + ";base64," + state.st.refX.b64;
    });
    out.B_sheet = dims.w === 1024 && dims.h === 684;

    const pend = state.st.pend.find(p => p.id === "st_style880");
    const frag = pend ? stFragOf(pend) : "";
    out.C_ids = frag.indexOf(lip.id) >= 0 && frag.indexOf(brow.id) >= 0;
    out.C_sheet = frag.indexOf("labeled reference sheet") >= 0;
    out.C_contract = frag.indexOf("PRESERVE:") >= 0 && frag.indexOf("NEVER produce:") >= 0 &&
      frag.indexOf("identity drift") >= 0 && frag.indexOf("IMAGE 2") >= 0;

    const rec1 = /about (\d+)% strength/.exec(frag);
    svSet("st_style880Str", "soft"); stSync("st_style880");
    const soft1 = /about (\d+)% strength/.exec(stFragOf(state.st.pend.find(p => p.id === "st_style880")));
    out.D_strength = rec1 && soft1 && +soft1[1] < +rec1[1];
    svSet("st_style880Str", "rec");

    const mkl = ST880.list.find(x => x.cat === "makeup_look");
    st880Pick(mkl);
    await new Promise(r2 => setTimeout(r2, 700));
    const st2 = st880Sel();
    out.E_conflict = st880Count() === 1 && st2.sel.makeup_look === mkl.id;
    const frag3 = stFragOf(state.st.pend.find(p => p.id === "st_style880"));
    out.E_single = frag3.indexOf("Style " + mkl.id) >= 0 && frag3.indexOf("labeled reference sheet") < 0;

    svSet("st_style880", { id: lip.id, mode: "face" });
    out.F_legacy = st880Sel().sel.lipstick === lip.id;

    localStorage.removeItem("hnk_st880_favs");
    st880FavToggle(lip.id);
    out.G_fav = st880Favs()[0] === lip.id &&
      JSON.parse(localStorage.getItem("hnk_st880_favs"))[0] === lip.id;
    st880FavToggle(lip.id);
    out.G_recent = st880Recent().indexOf(mkl.id) >= 0;

    /* H) live search in the DOM */
    const g880 = Array.from(document.querySelectorAll("#muHost > .grp")).pop();
    g880.className += g880.className.indexOf("open") >= 0 ? "" : " open";
    const inp = g880.querySelector('input[type="text"]');
    out.H_input = !!inp;
    if (inp) {
      inp.value = "douyin";
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(r2 => setTimeout(r2, 200));
      const cards = g880.querySelectorAll(".st880-grid .pcard").length;
      out.H_filtered = cards > 0 && cards < 660;
      inp.value = "";
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    }
    st880Clear();
    return out;
  });

  report("A) catalog v2 (880 + q) and pack contract load", r.A_catalog && r.A_q && r.A_contract, r);
  report("B) two-category combo builds the 1024x684 labeled sheet", r.B_two && r.B_sheet, r);
  report("C) frag: both ids + sheet header + rr/PRESERVE/NEVER + IMAGE 2", r.C_ids && r.C_sheet && r.C_contract, r);
  report("D) strength chips scale the pack recommendation", r.D_strength, r);
  report("E) makeup_look excludes components; single frag keeps Style <id> shape", r.E_conflict && r.E_single, r);
  report("F) legacy single-pick sv shape migrates", r.F_legacy, r);
  report("G) favorites + recent persist", r.G_fav && r.G_recent, r);
  report("H) search box filters the grid", r.H_input && r.H_filtered, r);
  report("no page errors", pageErrors.length === 0, pageErrors);

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
