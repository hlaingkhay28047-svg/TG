/* v5.92.0 / 6.63.0 — WHAT A CAPPED MODEL ACTUALLY RECEIVES, and what a switch
 * turned OFF actually says.
 *
 * The owner asked for every prompt to be checked. Reading all fifty-three
 * against the shipped model caps found that the cut, not the prompts, was
 * the defect: rhTruncatePrompt kept "everything from TASK GUARD: onward" —
 * the guard AND the AVOID list — and gave the task whatever room was left.
 * On the 800-character models (Qwen Image 2, Qwen Image 2 Pro, Jimeng 4.6)
 * the Studio composer's 1,026-character guard left NO room: the model got a
 * preservation rule and no task and handed the photograph back unchanged.
 * A Look Set on the same models arrived as its AVOID list and none of its
 * set. The panel, meanwhile, did a plain tail slice that dropped the guard
 * first and could stop mid-word. Two surfaces, two different cuts.
 *
 * The second finding was in the Look Sets' switches. "Wardrobe and makeup"
 * OFF removed the WARDROBE line — and left the request line naming the gown,
 * the consistency rule fixing "the wardrobe", and the guard saying "change
 * the wardrobe". A switch that removes one line while three others say the
 * opposite is not a switch. Every toggle now carries an `off` line that says
 * what OFF means, and the shared lines are conditional on the lines above.
 *
 * Checked here, on the real catalog and the real caps, on both surfaces:
 *   A) every workflow × every cap: within the cap; opens with the task, never
 *      with the guard; the guard arrives whole whenever it fits; AVOID only
 *      when whole; no line ends mid-word.
 *   B) the Studio composer's case that used to lose its task at 800.
 *   C) the panel's prompt-fit cuts byte-for-byte as the app's.
 *   D) every Look Set: each OFF line lands; wardrobe OFF names no garment;
 *      the request line names no garment; skin tone OFF says leave it.
 *   E) the video cards on the models that cap them: cut on a sentence, and
 *      the Video page says so before the credit is spent.
 *
 * Usage: PORT=8931 node test/verify_prompt_fit.js  (serve docs/app first) */
"use strict";
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  withPremium(browser);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2800);
  await page.addScriptTag({ path: path.join(__dirname, "..", "panel", "src", "providers", "prompt-fit.js") });

  /* ---------- A + C: every workflow × every real cap, both surfaces ---------- */
  const A = await page.evaluate(() => {
    const caps = Array.from(new Set(RH_MODELS.map(m => m.promptMax).filter(c => c && c < 20000))).sort((a, b) => a - b);
    const items = (window.HNK_WF_CATALOG || []).flatMap(c => c.items);
    const bad = [], mismatch = [];
    let checked = 0;
    function lines(t) { return t.split("\n").map(l => l.trim()).filter(Boolean); }
    items.forEach(w => {
      const p = window._wfBatchPrompt(w.id) || "";
      const gI = p.indexOf("TASK GUARD:");
      const guard = gI >= 0 ? p.slice(gI).split("\n\nAVOID:")[0].replace(/\s+$/, "") : "";
      const aI = p.indexOf("\n\nAVOID:");
      const avoid = aI >= 0 ? p.slice(aI) : "";
      const body = (gI >= 0 ? p.slice(0, gI) : p).replace(/\s+$/, "");
      caps.forEach(cap => {
        if (p.length <= cap) return;
        checked++;
        const out = rhTruncatePrompt(p, cap);
        const pf = HNK.promptFit.fit(p, cap);
        if (pf !== out) mismatch.push(w.id + "@" + cap);
        const why = [];
        if (out.length > cap) why.push("over cap " + out.length);
        /* v5.95.0 — since rhFitByBlocks the kept text is a SELECTION of whole
           blocks, not a contiguous prefix, so "is it a prefix of the body" is
           the wrong question and an earlier cut of this test asked it. What
           must still hold: the task's own first line always opens the prompt,
           every line that arrives is a WHOLE line from the source except at
           most the final one, and that final one stops at a word boundary. */
        /* the portion before the guard AND before the AVOID — a prompt with no
           TASK GUARD (retouch, pr-meitu, pr-evoto …) kept its AVOID in this
           slice and the AVOID line is not a body line */
        const outNoAvoid = out.indexOf("\n\nAVOID:") >= 0 ? out.slice(0, out.indexOf("\n\nAVOID:")) : out;
        const head = outNoAvoid.split("\n\nTASK GUARD:")[0];
        const srcLines = new Set(body.split("\n"));
        const outLines = head.split("\n");
        /* the first source line may itself be longer than the whole cap, in
           which case its OPENING is all that can arrive — that is still
           opening with the task */
        const firstSrc = body.split("\n")[0];
        if (outLines[0] !== firstSrc && !firstSrc.startsWith(outLines[0]))
          why.push("does not open with the task's first line");
        /* 6.126.0 — the LOCK lines are lifted out of the body and re-joined
           AFTER the task's opening, so the one line the character cut may have
           shortened is no longer the last: it is the last line of the task
           portion, with whole lock lines behind it. And a lock longer than its
           whole budget arrives as its own opening. So at most TWO lines may be
           short of their source — each must be that source line's opening and
           stop between words — and every other line arrives whole. */
        const shortened = outLines.filter(l => l && !srcLines.has(l));
        if (shortened.length > 2) why.push(shortened.length + " lines arrived cut");
        shortened.forEach(l => {
          const src = body.split("\n").find(x => x.startsWith(l));
          if (!src) why.push("a line is not the opening of any source line: …" + l.slice(-40));
          else if (l.length < src.length && !/[\s,;:—–-]/.test(src.charAt(l.length)))
            why.push("mid-word cut: …" + l.slice(-40));
        });
        if (guard) {
          if (out.indexOf("TASK GUARD:") < 0) why.push("guard gone");
          /* the guard is cut only when it alone exceeds the cap */
          if (guard.length + 2 < cap && out.indexOf(guard) < 0) why.push("guard fits but arrives cut");
        }
        /* 6.126.0 — an AVOID that will not fit whole arrives COMPACT, so the
           old "must end with the whole list" is now "whole, or the lead plus
           whole items of it, and never after a guard that went missing" */
        if (out.indexOf("AVOID:") >= 0) {
          if (guard && out.indexOf(guard) < 0) why.push("AVOID present without the whole guard");
          const got = out.slice(out.indexOf("\n\nAVOID:"));
          if (got !== avoid) {
            const srcItems = avoid.slice(avoid.indexOf("AVOID:") + 6).replace(/^\s+/, "").replace(/\s*\.\s*$/, "").split(/,\s*/);
            const gotItems = got.slice(got.indexOf("AVOID:") + 6).replace(/^\s+/, "").replace(/\s*\.\s*$/, "").split(/,\s*/);
            if (!gotItems.length) why.push("compact AVOID with no item");
            gotItems.forEach((it, k) => { if (it !== srcItems[k]) why.push("compact AVOID invented or reordered an item: " + it.slice(0, 40)); });
          }
        }
        if (why.length) bad.push({ id: w.id, cap: cap, why: why.slice(0, 3) });
      });
    });
    return { caps, n: items.length, checked, bad, mismatch };
  });
  report("A) every workflow that any shipped model caps arrives within the cap, opening with its task, guard whole when it fits, AVOID whole or compact from its own items, and at most two lines short of their source — each at a word boundary",
    A.bad.length === 0, A.bad.slice(0, 6));
  console.log("      (" + A.n + " workflows × caps " + A.caps.join("/") + " → " + A.checked + " cut cases checked)");
  report("C) the panel's prompt-fit.js cuts byte-for-byte as the app's rhTruncatePrompt, on every one of those cases",
    A.mismatch.length === 0, A.mismatch.slice(0, 8));

  /* ---------- A2 + A3: what 6.126.0 added — the locks and the AVOID ---------- */
  /* Measured on this catalog BEFORE the change: of the 434 workflow × cap
     cases the models cut, 65 lost a LOCK line and 406 lost the AVOID list
     whole. master-bgfg-replace at 800 arrived with all five of its locks
     gone — POSE, PROPORTION, SKIN, LIGHTING, FRAME — the lines that keep the
     student's subject the same person; and a prompt with fewer than three
     labelled blocks never reached rhFitByBlocks, so the plain character cut
     took the locks and the AVOID with it. Both are pinned here. */
  const L = await page.evaluate(() => {
    const caps = Array.from(new Set(RH_MODELS.map(m => m.promptMax).filter(c => c && c < 20000))).sort((a, b) => a - b);
    const items = (window.HNK_WF_CATALOG || []).flatMap(c => c.items);
    const RE = /^[A-Z][A-Za-z0-9 ,&'\/()—-]{0,60}\bLOCKS?\b[^\n:]{0,40}:/;
    const noLock = [], strayLock = [], noAvoid = [], tightGuard = [], noAge = [];
    let ageCases = 0;
    let withLocks = 0, whole = 0, compact = 0;
    /* what the cut has left for the body once the guard is paid for */
    const guardLen = (t, cap) => {
      const s2 = rhFitByBlocks(t, cap).text, gi = s2.indexOf("TASK GUARD:");
      if (gi < 0) return cap;
      let tail = s2.slice(gi); const ai2 = tail.indexOf("\n\nAVOID:");
      if (ai2 >= 0) tail = tail.slice(0, ai2);
      return cap - tail.replace(/\s+$/, "").length - 2;
    };
    items.forEach(w => {
      const p = window._wfBatchPrompt(w.id) || "";
      const gI = p.indexOf("TASK GUARD:"), aI = p.indexOf("\n\nAVOID:");
      const end = gI >= 0 ? gI : (aI >= 0 ? aI : p.length);
      const bodyLines = p.slice(0, end).replace(/\s+$/, "").split("\n");
      /* lifted locks are the ones after the first line; the comparison set is
         EVERY lock-shaped body line, because the forty wedding cards open with
         their own WEDDING LOCK and that line stays in the task */
      const srcLocks = bodyLines.filter((l, i) => i > 0 && RE.test(l));
      const allLockLines = bodyLines.filter(l => RE.test(l));
      const avoid = aI >= 0 ? p.slice(aI) : "";
      caps.forEach(cap => {
        if (p.length <= cap) return;
        const out = rhTruncatePrompt(p, cap);
        if (srcLocks.length) {
          withLocks++;
          const gotLocks = out.split("\n").filter(l => RE.test(l));
          /* 6.127.0 — where the TASK GUARD alone all but fills the cap there is
             no lock room to reserve: the lock share is 45% of what the guard
             leaves, and rhKeepWhole needs more than 80 characters before it
             will send even a lock's own opening. Those cases are counted, not
             excused by name — the same class A3 already records for the AVOID. */
          const room = guardLen(p, cap);
          if (!gotLocks.length && room < 178) tightGuard.push(w.id + "@" + cap + " room " + room);
          else if (!gotLocks.length) noLock.push(w.id + "@" + cap + " had " + srcLocks.length);
          gotLocks.forEach(g => { if (!allLockLines.some(sl => sl === g || sl.startsWith(g))) strayLock.push(w.id + "@" + cap + " :: " + g.slice(0, 40)); });
        }
        /* 6.127.0 — the skin cards' age rule travels on two channels: the AGE
           LOCK line in the body and the three items that open the AVOID list.
           At least one of them has to arrive. */
        if (p.indexOf("AGE LOCK:") >= 0) {
          ageCases++;
          if (out.indexOf("AGE LOCK") < 0 &&
              !/added wrinkles|deepened lines|older-looking face/.test(out)) noAge.push(w.id + "@" + cap);
        }
        if (avoid) {
          if (out.indexOf("AVOID:") < 0) noAvoid.push({ id: w.id, cap: cap, left: cap - out.length });
          else if (out.endsWith(avoid)) whole++; else compact++;
        }
      });
    });
    return { withLocks, noLock, strayLock, noAvoid, tightGuard, ageCases, noAge, whole, compact };
  });
  report("A2) a prompt whose body carries LOCK lines never arrives without one — the locks are lifted past the character cut, and every lock that arrives is a source lock whole or that lock's own opening",
    L.noLock.length === 0 && L.strayLock.length === 0, { noLock: L.noLock.slice(0, 6), stray: L.strayLock.slice(0, 4) });
  console.log("      (" + L.withLocks + " cut cases carry locks; before 6.126.0, 65 cases lost one and master-bgfg-replace@800 lost all five)");
  /* 6.127.0 — the AGE LOCK gave two heritage cards their first body lock, and
     both are cards whose TASK GUARD alone fills the 800 cap (Studio Look Copy
     leaves 59 characters, Lanna Gold Heritage is 193 over it). No lock can be
     sent there, and the cut says so rather than pretending otherwise. Only at
     800, only where the guard left under 178 characters, and only these two —
     if a third appears, a guard has grown and this fails. */
  report("A2b) the only cut cases that carry no lock are the ones whose TASK GUARD alone left under 178 characters — the lock share of that is below the 80-character floor an opening needs",
    /* 6.129.0 — Couple Compose joins the two. Its own body carried no LOCK line
       at all until this release, so it was never a case of "locks in the source,
       none in the cut"; now it carries the frame-extent and colour-separation
       locks like every other Background & Scene card, and its TASK GUARD is
       1,057 characters against an 800 cap, so the cut has 259 characters less
       than nothing to give them. The rule is unchanged and all three satisfy it. */
    L.tightGuard.length <= 3 && L.tightGuard.every(r => /@800 room (59|-259|-193)$/.test(r)), L.tightGuard);
  /* 6.127.0 — what the owner actually asked for: a capped model must still be
     told that a retouch only reduces. Measured over this catalog, 156 of the
     158 cut cases carry the AGE LOCK line or one of its AVOID items; the two
     that carry neither are Studio Look Copy and Lanna Gold Heritage at 800,
     whose TASK GUARD alone fills the cap and leaves room for no rule at all. */
  report("A2c) every capped run of a skin card still says a retouch only reduces — by the AGE LOCK line or by the items that open its AVOID list — but the two whose guard alone fills the 800 cap",
    L.noAge.length <= 2 && L.noAge.every(r => /@800$/.test(r)), L.noAge);
  console.log("      (" + (L.ageCases - L.noAge.length) + " of " + L.ageCases + " cut cases carry the age rule; before the AVOID items were moved to the front, 142 did)");

  /* the three that carry none are the cards whose TASK GUARD alone all but
     fills the 800 cap — 6, 15 and 20 characters left after the guard */
  report("A3) the AVOID arrives on every capped run but the three whose guard alone leaves under 25 characters: whole when it fits, otherwise compact — its own lead and its own opening items, in order",
    L.noAvoid.length <= 3 && L.noAvoid.every(r => r.cap === 800 && r.left < 25),
    L.noAvoid);
  console.log("      (" + L.whole + " whole + " + L.compact + " compact of " + (L.whole + L.compact + L.noAvoid.length) + "; before 6.126.0 only 28 of 434 carried an AVOID at all)");

  /* ---------- B: the Studio composer at 800 ---------- */
  const B = await page.evaluate(() => {
    const task = "Enhance this photo naturally.";
    const full = task + "\n\nTASK GUARD:\n" + D.guards.core + "\n" + D.guards.textBan;
    const out = rhTruncatePrompt(full, 800);
    return { guardLen: full.length - task.length - 2, out: out, startsWithTask: out.startsWith(task),
      hasGuard: out.indexOf("TASK GUARD:") >= 0, len: out.length,
      guardFirstSentence: out.indexOf("change ONLY what the TASK asks") >= 0 };
  });
  report("B) the Studio composer on an 800-character model keeps its task AND the guard's first sentence — the case that used to send a rule and no task",
    B.startsWithTask && B.hasGuard && B.guardFirstSentence && B.len <= 800, B);

  /* ---------- D: the Look Set switches ---------- */
  const Dd = await page.evaluate(() => {
    const cat = (window.HNK_WF_CATALOG || []).find(c => c.t === "Look Sets");
    const items = cat ? cat.items : [];
    const GARMENT = /\b(gown|dress|corset|bodice|brocade|halter|chiffon|organza|velvet|lace|robe|shawl|gloves|heels|earrings?|neck ring)\b/i;
    const out = [];
    items.forEach(w => {
      const issues = [];
      (w.fields || []).forEach(f => {
        if (f.type !== "toggle") return;
        const vals = {}; vals[f.key] = false;
        const p = window._wfFieldPrompt(w.id, vals);
        const tagLines = p.split("\n").filter(l => l.indexOf(f.tag) === 0);
        if (f.off) {
          if (tagLines.length !== 1 || tagLines[0] !== f.off) issues.push(f.key + ": OFF line did not land");
        } else if (tagLines.length) issues.push(f.key + ": line survived OFF");
        if (f.key === "wardrobe") {
          /* the set's own NAME is a label, not an instruction — two sets are
             named for a fabric (Misty Grey Organza, Peach Velvet). The name
             is allowed to survive; everything else must not dress the
             student, and the OFF line has to disarm the name explicitly. */
          const rest = p.split("\n").filter(l => l.indexOf("SET AND BACKDROP:") !== 0 && l !== f.off)
            .join("\n").replace(/from the .*? set\b/g, "from the set");
          const m = rest.match(GARMENT);
          if (m) issues.push("wardrobe OFF still names a garment: …" + rest.slice(Math.max(0, m.index - 50), m.index + 40));
          if (!/keep the person's own clothing/.test(p)) issues.push("wardrobe OFF does not say keep own clothing");
          if (!/that is the set's name and not an instruction/.test(p)) issues.push("wardrobe OFF does not disarm the set's name");
        }
        if (f.key === "skintone" && !/leave the skin tone exactly as photographed/.test(p)) issues.push("skin tone OFF does not say leave it");
      });
      const req = (w.prompt.split("\n").find(l => /^Re-shoot IMAGE 1/.test(l)) || "")
        .replace(/from the .*? set\b/, "from the set");
      if (GARMENT.test(req)) issues.push("request line names a garment outside the set's own name");
      if (!/wherever a line above sets them/.test(w.prompt)) issues.push("consistency rule not conditional on the lines above");
      if (!/where a line above sets them/.test(w.prompt)) issues.push("guard not conditional on the lines above");
      const allOff = {}; (w.fields || []).forEach(f => { if (f.type === "toggle") allOff[f.key] = false; });
      const q = window._wfFieldPrompt(w.id, allOff);
      ["INPUT ROLES:", "FRAMING RULE:", "CONSISTENCY RULE:", "TASK GUARD:"].forEach(k => { if (q.indexOf(k) < 0) issues.push("all-off lost " + k); });
      if (/\{\{/.test(q)) issues.push("raw token with everything off");
      if (issues.length) out.push({ id: w.id, issues });
    });
    return { n: items.length, out };
  });
  report("D) on every Look Set each switch turned OFF says what OFF means — wardrobe OFF keeps the student's own clothes and names no garment anywhere, skin tone OFF leaves the tone alone, and the request, consistency and guard lines no longer overrule a switch",
    Dd.n === 13 && Dd.out.length === 0, Dd.out.slice(0, 4));

  /* ---------- E: the video cards on the models that cap them ---------- */
  const E = await page.evaluate(() => {
    const capped = RH_VIDEO_MODELS.filter(m => m.promptMax);
    const bad = []; let checked = 0;
    VID_WF.forEach(w => {
      const t = w.cities ? w.text(vidCityDef(VID_CITIES[0].k)) : w.text();
      capped.forEach(m => {
        if (t.length <= m.promptMax) return;
        checked++;
        const out = rhTruncatePrompt(t, m.promptMax);
        const firstSentence = t.split(/(?<=[.!?])\s/)[0];
        if (out.length > m.promptMax || !out.startsWith(firstSentence) || !/[.!?]["”')\]]?$/.test(out) || out !== HNK.promptFit.fit(t, m.promptMax))
          bad.push(w.key + "@" + m.id);
      });
    });
    return { checked, bad, cards: VID_WF.length, capped: capped.map(m => m.id + ":" + m.promptMax) };
  });
  report("E) every video card a capped video model would shorten is cut on a sentence, opens with its own first sentence, and cuts identically on the panel",
    E.checked > 0 && E.bad.length === 0, E);
  console.log("      (" + E.cards + " cards; capped video models " + E.capped.join(", ") + "; " + E.checked + " cut cases)");

  const E2 = await page.evaluate(() => {
    const sel = document.getElementById("selVidModel");
    const tight = RH_VIDEO_MODELS.filter(m => m.promptMax).sort((a, b) => a.promptMax - b.promptMax)[0];
    const roomy = RH_VIDEO_MODELS.find(m => !m.promptMax || m.promptMax >= 4000);
    const card = VID_WF.find(w => w.key === "boardingPass");
    const text = card.text(vidCityDef(VID_CITIES[0].k));
    function pick(id) { sel.value = id; sel.onchange && sel.onchange(); }
    pick(tight.id);
    const box = document.getElementById("vidPrompt");
    box.value = text; box.dispatchEvent(new Event("input", { bubbles: true }));
    const h = document.getElementById("vidCapHint");
    const shownTight = h && h.style.display !== "none" ? h.textContent : "";
    pick(roomy.id);
    const shownRoomy = h && h.style.display !== "none" ? h.textContent : "";
    return { tight: tight.id + ":" + tight.promptMax, roomy: roomy.id, textLen: text.length,
      shownTight, hiddenOnRoomy: shownRoomy === "", namesCap: shownTight.indexOf(String(tight.promptMax)) >= 0, hasScissors: shownTight.indexOf("✂") >= 0 };
  });
  report("E2) the Video page says so: a card longer than the picked model's cap raises the ✂ line naming the cap, and the line goes when a roomier model is picked",
    !!E2.shownTight && E2.namesCap && E2.hasScissors && E2.hiddenOnRoomy, E2);

  report("F) no page error anywhere in this journey", errs.length === 0, errs);
  console.log("\n" + (failures === 0
    ? "All checks passed — every model gets the task first, every switch says what OFF means, and both surfaces cut the same way."
    : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
