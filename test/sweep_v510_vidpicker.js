/* v5.1.0 regression sweep — the video model picker is a sheet, and every one
   of the sixty-five models has a name a customer can read.

   WHAT THE OWNER SENT. A screenshot of the Android native <select>: sixty-five
   options, every label a raw RunningHub slug with the family name repeated
   inside it — "kling-v2.5-turbo-pro — 10s" sitting under a group header that
   already said "Kling (13)" — each one wrapping to two ragged lines, and the
   spec suffix hand-written and inconsistent ("10s", "1080p, 15s", nothing at
   all). His words: make the model UI tidy.

   THE DESIGN DECISION THIS SWEEP PROTECTS. The native <select> is NOT removed.
   It is hidden and kept as the single source of truth, because vidModelDef(),
   every video workflow card (vidWfApply), the presets, saveState and six
   existing sweeps all drive it by .value and read its <option> children. The
   sheet writes to the select and then calls the select's OWN onchange, so the
   res/duration/aspect rebuild, the prompt cap and the need-note all run exactly
   as they did when this was a dropdown. B is what fails if someone later
   "simplifies" this by deleting the select and holding the id in a variable.

   AND THE NAMES ARE A CONTRACT, NOT DECORATION. These map to paid endpoints and
   the owner matches them against RunningHub's pricing page, so E asserts every
   name is still derivable from the id/apiPath — no invented marketing names —
   and F asserts no spec claims a resolution or duration the descriptor does not
   contain. A model that declares neither gets an empty spec, not a guess.

   Usage: PORT=8931 node test/sweep_v510_vidpicker.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

/* measured on the build this release replaced, at 390px */
const BEFORE = { wrappedLabels: 63, searchable: false };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = [], bad = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  page.on("response", r => { if (r.status() >= 400) bad.push(new URL(r.url()).pathname); });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
    localStorage.setItem("hnk_ws_lang", "my");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);

  /* ---- A) the dropdown is gone from view, the summary button replaces it ---- */
  const shell = await page.evaluate(async () => {
    switchPage("pgVideo");
    await new Promise(r => setTimeout(r, 500));
    const btn = document.getElementById("btnVidModelPick");
    const b = btn.getBoundingClientRect();
    return {
      selHidden: getComputedStyle(document.getElementById("selVidModel")).display === "none",
      btnH: Math.round(b.height), btnW: Math.round(b.width),
      fam: document.getElementById("vidModelFam").textContent,
      name: document.getElementById("vidModelName").textContent,
      /* the summary must fit the phone without the button growing past 3 lines */
      lines: Math.round(b.height / 17),
      pageW: 390,
    };
  });
  report("A) the 65-option dropdown is hidden and a summary button takes its place",
    shell.selHidden === true && shell.btnH >= 44 && shell.btnW <= shell.pageW &&
    shell.fam.length > 0 && shell.name.length > 0,
    shell);

  /* ---- B) THE CONTRACT: the select is still the source of truth ---- */
  const contract = await page.evaluate(async () => {
    const sel = document.getElementById("selVidModel");
    const optCount = sel.options.length;
    /* everything that used to drive the dropdown must still drive it */
    sel.value = "gemini-omni-video"; sel.onchange();
    await new Promise(r => setTimeout(r, 250));
    const viaSelect = { def: vidModelDef().id, name: document.getElementById("vidModelName").textContent };
    /* a video workflow card */
    let viaWf = null;
    if (typeof VID_WF !== "undefined" && VID_WF.length) {
      vidWfApply(VID_WF[0]);
      await new Promise(r => setTimeout(r, 250));
      viaWf = { sel: sel.value, name: document.getElementById("vidModelName").textContent };
    }
    /* and the sheet writes THROUGH the select, not around it */
    document.getElementById("btnVidModelPick").click();
    await new Promise(r => setTimeout(r, 300));
    const rows = document.querySelectorAll("#vidModelList .pt-wfrow");
    const target = rows[rows.length - 1];
    const targetName = target.querySelector(".wt").textContent;
    target.click();
    await new Promise(r => setTimeout(r, 300));
    const viaSheet = { sel: sel.value, def: vidModelDef().id,
                       name: document.getElementById("vidModelName").textContent, targetName };
    return { optCount, viaSelect, viaWf, viaSheet, total: RH_VIDEO_MODELS.length };
  });
  report("B) the <select> survives as the single source of truth, with every option",
    contract.optCount === contract.total && contract.viaSelect.def === "gemini-omni-video",
    contract);
  report("B2) a workflow card still drives the model, and the button follows",
    !!contract.viaWf && contract.viaWf.sel.length > 0 && contract.viaWf.name.length > 0,
    contract.viaWf);
  report("B3) the sheet writes through the select — vidModelDef agrees with the row tapped",
    contract.viaSheet.sel === contract.viaSheet.def &&
    contract.viaSheet.name === contract.viaSheet.targetName,
    contract.viaSheet);

  /* ---- C) the sheet is a real catalogue: grouped, searchable, tappable ---- */
  const sheet = await page.evaluate(async () => {
    document.getElementById("btnVidModelPick").click();
    await new Promise(r => setTimeout(r, 300));
    const open = /on/.test(document.getElementById("vidModelSheet").className);
    const all = document.querySelectorAll("#vidModelList .pt-wfrow").length;
    const groups = document.querySelectorAll("#vidModelList .subh").length;
    const rowH = Math.round(document.querySelector("#vidModelList .pt-wfrow").getBoundingClientRect().height);
    const marked = document.querySelectorAll("#vidModelList .pt-wfrow.on").length;
    const q = document.getElementById("vidModelSearch");
    q.value = "kling"; q.oninput(); await new Promise(r => setTimeout(r, 150));
    const kling = document.querySelectorAll("#vidModelList .pt-wfrow").length;
    q.value = "zzzznothing"; q.oninput(); await new Promise(r => setTimeout(r, 150));
    const none = document.querySelectorAll("#vidModelList .pt-wfrow").length;
    /* searching by apiPath finds a model whose NAME does not contain the word */
    q.value = "veo"; q.oninput(); await new Promise(r => setTimeout(r, 150));
    const veo = document.querySelectorAll("#vidModelList .pt-wfrow").length;
    q.value = ""; q.oninput(); await new Promise(r => setTimeout(r, 150));
    const famCount = RH_VIDEO_MODELS.reduce((a, m) => { a[m.fam || "HNK"] = 1; return a; }, {});
    document.getElementById("btnVidModelClose").click();
    await new Promise(r => setTimeout(r, 250));
    return { open, all, groups, rowH, marked, kling, none, veo,
             fams: Object.keys(famCount).length,
             closed: !/on/.test(document.getElementById("vidModelSheet").className),
             body: getComputedStyle(document.body).overflow };
  });
  report("C) every model is listed, grouped by family, with the current one marked",
    sheet.open && sheet.all === contract.total && sheet.groups === sheet.fams && sheet.marked === 1,
    sheet);
  report("C2) search narrows by name and by apiPath, and says when nothing matches",
    sheet.kling === 13 && sheet.none === 0 && sheet.veo > 0 && sheet.veo < sheet.all, sheet);
  report("C3) rows clear the 44px touch floor and closing gives the page its scroll back",
    sheet.rowH >= 44 && sheet.closed && sheet.body !== "hidden", sheet);

  /* ---- D) Android Back closes it. v5.0.1 shipped this bug once on the
     workflow picker; a second full-screen overlay must not repeat it. ---- */
  const back = await page.evaluate(async () => {
    document.getElementById("btnVidModelPick").click();
    await new Promise(r => setTimeout(r, 300));
    const locked = getComputedStyle(document.body).overflow === "hidden";
    window.dispatchEvent(new PopStateEvent("popstate", { state: { pg: "pgDash" } }));
    await new Promise(r => setTimeout(r, 300));
    const out = { locked,
      closed: !/on/.test(document.getElementById("vidModelSheet").className),
      scrollable: getComputedStyle(document.body).overflow !== "hidden" };
    switchPage("pgVideo"); await new Promise(r => setTimeout(r, 300));
    return out;
  });
  report("D) Android Back closes the model sheet and unlocks the page",
    back.locked && back.closed && back.scrollable, back);

  /* ---- E) NAMES ARE A CONTRACT ---- */
  const names = await page.evaluate(() => {
    const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
    const rows = RH_VIDEO_MODELS.map(m => ({
      id: m.id, fam: m.fam || "HNK", name: vidMName(m), spec: vidMSpec(m),
      hay: norm(m.id + " " + (m.apiPath || "") + " " + (m.label || "")),
    }));
    const invented = rows.filter(r => {
      /* every alphanumeric run of 3+ chars in the name must appear in the
         model's own id/apiPath/label — that is what "not invented" means */
      const words = String(r.name).toLowerCase().match(/[a-z0-9]{3,}/g) || [];
      return words.some(w => r.hay.indexOf(w) < 0);
    });
    const tooLong = rows.filter(r => r.name.length > 34);
    const empty = rows.filter(r => !r.name || !r.name.trim());
    /* family must not be repeated inside its own rows' names */
    const repeats = rows.filter(r => r.fam !== "HNK" &&
      norm(r.name).indexOf(norm(r.fam)) === 0 && norm(r.fam).length > 3);
    /* unique within family */
    const seen = {}, dupes = [];
    rows.forEach(r => { const k = r.fam + "|" + r.name.toLowerCase();
      if (seen[k]) dupes.push(k); seen[k] = 1; });
    return { n: rows.length, invented: invented.map(r => r.id + ": " + r.name),
             tooLong: tooLong.map(r => r.id), empty: empty.map(r => r.id),
             repeats: repeats.map(r => r.fam + " / " + r.name), dupes };
  });
  report("E) no name was invented — every word in it comes from the model's own id/apiPath/label",
    names.invented.length === 0, names.invented.slice(0, 6));
  report("E2) every name is unique within its family, non-empty, and fits a phone row",
    names.dupes.length === 0 && names.empty.length === 0 && names.tooLong.length === 0,
    { dupes: names.dupes.slice(0, 6), empty: names.empty, tooLong: names.tooLong });
  report("E3) no name repeats the family the group header already shows",
    names.repeats.length === 0, names.repeats.slice(0, 6));

  /* ---- F) SPECS ARE A CONTRACT ---- */
  const specs = await page.evaluate(() => {
    const RES = ["360p", "480p", "540p", "720p", "1080p", "2K", "4K"];
    const lies = [], stale = [];
    RH_VIDEO_MODELS.forEach(m => {
      const s = vidMSpec(m);
      const res = (m.resolutions || []).map(x => String(x).toLowerCase().replace("native", ""));
      const dur = (m.durations || []).map(x => parseInt(x, 10)).filter(x => !isNaN(x));
      const claimedRes = RES.filter(r => s.indexOf(r) >= 0);
      const claimedDur = (s.match(/(\d+)(?:–(\d+))?s/) || []).slice(1).filter(Boolean).map(Number);
      /* a claimed resolution the descriptor does not have */
      claimedRes.forEach(r => { if (res.indexOf(r.toLowerCase()) < 0) lies.push(m.id + " res " + r); });
      /* a claimed duration outside the declared set */
      if (claimedDur.length && dur.length) {
        if (claimedDur[0] !== Math.min(...dur)) lies.push(m.id + " durMin " + claimedDur[0]);
        const hi = claimedDur[1] !== undefined ? claimedDur[1] : claimedDur[0];
        if (hi !== Math.max(...dur)) lies.push(m.id + " durMax " + hi);
      }
      /* a spec on a model that declares nothing at all */
      if (!res.length && claimedRes.length) lies.push(m.id + " res from nothing");
      if (!dur.length && claimedDur.length) lies.push(m.id + " dur from nothing");
      /* the largest declared resolution must be the one shown */
      if (res.length && claimedRes.length) {
        const top = RES.filter(r => res.indexOf(r.toLowerCase()) >= 0).pop();
        if (top && claimedRes[claimedRes.length - 1] !== top) stale.push(m.id + " shows " + claimedRes + " not " + top);
      }
      /* un-normalised tokens must not survive into the UI */
      if (/native|1080P|4k\b|2k\b/.test(s)) stale.push(m.id + " raw token: " + s);
    });
    const bothUnknown = RH_VIDEO_MODELS.filter(m =>
      !(m.resolutions || []).length && !(m.durations || []).length);
    return { lies, stale,
      bothUnknown: bothUnknown.length,
      bothUnknownWithSpec: bothUnknown.filter(m => vidMSpec(m)).map(m => m.id) };
  });
  report("F) no spec claims a resolution or duration the descriptor does not contain",
    specs.lies.length === 0, specs.lies.slice(0, 8));
  report("F2) the largest declared resolution is the one shown, normalised",
    specs.stale.length === 0, specs.stale.slice(0, 8));
  report("F3) a model that declares neither gets an empty spec, never a guess",
    specs.bothUnknown > 0 && specs.bothUnknownWithSpec.length === 0,
    { modelsWithNothingDeclared: specs.bothUnknown, wrongly: specs.bothUnknownWithSpec });

  /* ---- G) the hidden option text carries the same identity ---- */
  const opts = await page.evaluate(() => {
    const sel = document.getElementById("selVidModel");
    const mismatched = [];
    RH_VIDEO_MODELS.forEach(m => {
      const o = sel.querySelector('option[value="' + m.id + '"]');
      if (!o) { mismatched.push(m.id + " missing"); return; }
      if (o.textContent.indexOf(vidMName(m)) < 0) mismatched.push(m.id + " -> " + o.textContent);
    });
    return { mismatched, sample: sel.options[0].textContent };
  });
  report("G) every hidden <option> names the same model the sheet does",
    opts.mismatched.length === 0, opts.mismatched.slice(0, 6));

  report("H) no page errors", errs.length === 0, errs);
  report("H2) nothing 404s", bad.length === 0, bad.slice(0, 6));

  console.log("      (" + contract.total + " models, " + sheet.fams +
    " families, searchable; was " + BEFORE.wrappedLabels + " slug labels in a native dropdown)");

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  process.exit(failures ? 1 : 0);
})();
