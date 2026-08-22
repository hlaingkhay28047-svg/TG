/* v4.67.0 regression sweep — a sketch can drive the pose.

   THE QUESTION THAT PROMPTED THIS. Can this app do what multi-reference edit
   models are good at — hand the model several images and split their roles
   precisely, so a rough sketch controls pose and layout while a photo controls
   identity? The answer turned out to be that the app was already 90% there and
   nobody had said so.

   WHAT WAS ALREADY TRUE, measured rather than assumed:
     - The registry already carries all four families the owner named: Nano
       Banana Pro, Qwen Image Edit, Seedream and Wan (18 models in total).
     - rhV2Body sends body.imageUrls as an ORDERED ARRAY. There is no per-image
       role parameter in the API and there does not need to be.
     - Every preset already emits a ROLE MAP at the top of its prompt —
       "IMAGE 2 = X. Use it ONLY for this purpose." — which is exactly the
       contract those models read. Role separation is carried by the sentence
       and the position, not by provider code.

   SO THE ONLY MISSING PIECE was a role that hands the model GEOMETRY and
   forbids APPEARANCE. Every other role says "copy how this looks". A sketch
   role has to say the opposite, and has to say it against three things these
   models actually do when handed a drawing:
     1. they return a drawing instead of a photograph;
     2. they paint the pencil strokes, paper and flatness into the result;
     3. they copy a stick figure's impossible limb lengths onto a real body.
   All three are named explicitly in the role sentence and in the workflow, and
   this file fails if any of those sentences is ever softened away.

   Pinned contracts:
   A) All four named model families are still registered and reachable.
   B) The transport is still an ordered array — if imageUrls ever becomes a
      single image, every multi-reference workflow in the app silently loses
      its second and third slot.
   C) The sketch role exists, is reachable by cycling the role pill, and its
      label fits the tile at phone widths without clipping.
   D) The role sentence still carries all four guarantees: geometry-only,
      no drawn marks, must be a photograph, fix impossible anatomy.
   E) The Sketch Pose Control workflow exists, is in the grid, and its ROLE MAP
      binds IMAGE 1 to identity, IMAGE 2 to the sketch and IMAGE 3 to an
      optional scene.
   F) It refuses to treat anything drawn as an extra person — the count lock.
   G) A workflow shipping without card art is declared in NO_CARD_JPG, so the
      grid draws its icon instead of waiting out a guaranteed 404 — measured
      on the wire in both directions (G1 nothing 404s, G2 nothing is declared
      whose photo actually exists), so it holds with the list empty or full.

   Usage: PORT=8931 node test/sweep_v467_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const src = fs.readFileSync(path.join(__dirname, "..", "docs", "app", "index.html"), "utf8");

/* A) the four families the owner asked about */
const FAMILIES = {
  "Nano Banana Pro": /id:"nano-banana-pro"/,
  "Qwen Image Edit": /id:"qwen-image-2"/,
  "Seedream": /id:"seedream-v4"/,
  "Wan Image Edit": /id:"wan-image-edit"/
};
const missingFam = Object.keys(FAMILIES).filter(k => !FAMILIES[k].test(src));
report("A) all four multi-reference model families are registered",
  missingFam.length === 0, missingFam);

/* B) the transport stays an ordered array */
report("B) rhV2Body still sends imageUrls as an ordered array, not one image",
  /body\.imageUrls\s*=\s*imageUrls/.test(src) &&
  /var imageParam\s*=\s*cfg\.imageParam\s*\|\|\s*"imageUrls"/.test(src));

/* v5.39.0 — C2 WAS MEASURING NOTHING. The ref tiles and their role pills were
   measured with no account fixture, so the access wall hid the page they live
   on and every rectangle came back 0x0: `fits` reduced to 0 <= 0+1 && 0 >= 0-1
   and `clipped` to 0 > 0+1, a true and a false that no layout change could
   move. A label overflowing its tile — the entire subject of the check — was
   unreachable. withPremium renders the page; refHostPage() below finds
   whichever page the tiles are actually on rather than assuming; and the zero
   guard turns "not rendered" back into a failure. */
(async () => {
  const browser = withPremium(await chromium.launch());
  const pageErrors = [];
  const byWidth = {};
  /* G) watches the WIRE, not a literal. See the rewrite note above assertion G. */
  const art404 = [];
  const artOK = new Set();

  for (const w of [320, 390]) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true
    });
    const page = await ctx.newPage();
    page.on("pageerror", e => pageErrors.push(w + "px " + String(e).slice(0, 160)));
    page.on("response", r => {
      const u = r.url();
      if (!/\/lib\/wf\/cards5\/[^/]+\.jpg$/.test(u)) return;
      const f = u.split("/").pop();
      if (r.status() === 404) art404.push(w + "px " + f); else if (r.status() < 400) artOK.add(f);
    });
    await page.addInitScript(() => {
      localStorage.setItem("hnk_ws_onboarded", "1");
      localStorage.setItem("hnk_ws_seen", "1");
    });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1700);

    byWidth[w] = await page.evaluate(async () => {
      const out = {};
      const PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
      state.refs[0] = { mime: "image/png", b64: PX, label: "t" };
      state.refs[1] = { mime: "image/png", b64: PX, label: "t" };
      state.imgRoles = null;
      renderRefs();
      await new Promise(r => setTimeout(r, 250));

      /* go to whatever page the ref tiles are actually on. Assuming the id
         would be the same mistake in a different place — the nav has been
         regrouped twice and two other sweeps still point at ids that were
         retired in v4.27. */
      const firstRef = document.querySelector(".ref");
      const host = firstRef && firstRef.closest(".page");
      if (host && typeof switchPage === "function") switchPage(host.id);
      await new Promise(r => setTimeout(r, 250));
      out.refHostPage = host ? host.id : "";
      out.refPageShown = (document.querySelector(".page.on") || {}).id || "";

      out.roleKeys = REF_ROLES.map(r => r.k);
      const sk = REF_ROLES.filter(r => r.k === "sketch")[0];
      out.hasSketch = !!sk;
      if (sk) {
        out.guarantees = {
          geometryOnly: /GEOMETRY ONLY/.test(sk.sent),
          noDrawnMarks: /Do NOT reproduce its lines/.test(sk.sent),
          mustBePhotograph: /PHOTOGRAPH, never a drawing/.test(sk.sent),
          fixesAnatomy: /natural human proportions/.test(sk.sent)
        };
      }

      /* C) reachable by cycling, and the label fits its tile.
         Re-query the pill every iteration: renderRefs() rebuilds the DOM, and a
         held reference goes stale after the first click — which is exactly how
         an earlier version of this check silently measured a detached node. */
      const pill = () => Array.from(document.querySelectorAll(".ref"))[1].querySelector(".refrole");
      const tile = () => Array.from(document.querySelectorAll(".ref"))[1].getBoundingClientRect();
      const seen = [], fits = [], clipped = [];
      /* the guard: a hidden tile measures 0x0 and then every comparison below
         is between zeroes */
      out.tileRendered = (() => { const r = tile(); return r.width > 0 && r.height > 0; })();
      /* v5.40.0 — and it must stay INSIDE the tile. v5.39.0 let the pill wrap
         with no height cap, so a long enough label grew it taller than the
         88px tile and hung it off the top edge — while both metrics above
         reported clean, because an uncapped box can never overflow itself. */
      out.escapes = [];
      for (let i = 0; i < REF_ROLES.length; i++) {
        const q = pill(), tr = tile(), pr = q.getBoundingClientRect();
        seen.push(q.textContent.trim());
        fits.push(pr.right <= tr.right + 1 && pr.left >= tr.left - 1);
        /* v5.39.0 — height too. The label wraps to two lines now, so a label
           that outgrows the pill would hide a whole line rather than trail an
           ellipsis, and a width-only check would call that clean. */
        clipped.push(q.scrollWidth > q.clientWidth + 1 || q.scrollHeight > q.clientHeight + 1);
        if (!(pr.top >= tr.top - 1 && pr.bottom <= tr.bottom + 1)) {
          out.escapes.push(q.textContent.trim().slice(0, 24) + " h=" + Math.round(pr.height) + " tile=" + Math.round(tr.height));
        }
        q.click();
        await new Promise(r => setTimeout(r, 70));
      }
      out.seenLabels = seen;
      out.reachedSketch = seen.some(x => /Sketch|ပုံကြမ်း/.test(x));
      out.allFit = fits.every(Boolean);
      out.anyClipped = clipped.some(Boolean);

      /* E-G) the workflow */
      const D = JSON.parse(document.getElementById("hnkData").textContent);
      const pr = D.presets.filter(p => p.key === "sketchPose")[0];
      out.presetExists = !!pr;
      out.presetCount = D.presets.length;
      out.countsMatch = D.counts.presets === D.presets.length;
      if (pr) {
        out.roleMap = {
          img1Identity: /IMAGE 1 = MAIN SUBJECT/.test(pr.text),
          img2Sketch: /IMAGE 2 = POSE \/ LAYOUT SKETCH - GEOMETRY ONLY/.test(pr.text),
          img3Optional: /IMAGE 3 = SCENE \/ STYLE REFERENCE \(optional\)/.test(pr.text),
          noDrawnMarks: /Do NOT reproduce its lines/.test(pr.text),
          mustBePhotograph: /result is a PHOTOGRAPH/.test(pr.text),
          fixesAnatomy: /correct them to natural human proportions/.test(pr.text),
          countLock: /never an extra person/.test(pr.text)
        };
      }
      document.querySelectorAll(".page").forEach(x => x.classList.remove("on"));
      document.getElementById("pgWf").classList.add("on");
      await new Promise(r => setTimeout(r, 1100));
      /* v4.81 — scoped to #wfHost. pgVideo now renders .wfmini cards of its
         own, and a bare document-wide selector would quietly start counting
         them: this assertion is about the WORKFLOW GRID, and a count that
         drifts with an unrelated page is measuring the wrong thing. */
      const titles = Array.from(document.querySelectorAll("#wfHost .wfmini"))
        .map(c => (c.querySelector(".t") || {}).textContent || "");
      out.cards = titles.length;
      out.inGrid = titles.some(t => /Sketch Pose|ပုံကြမ်းနဲ့/.test(t));

      /* G) every card's art has to actually be REQUESTED before the response
         listener can judge it. The grid ships loading="lazy" and the groups
         start collapsed, so a plain render fetches a couple of screens' worth
         and the check would pass by never asking. Open every group, force the
         images eager, and let them settle. */
      document.querySelectorAll("#wfHost .grp").forEach(g => g.classList.add("open"));
      await new Promise(r => setTimeout(r, 200));
      document.querySelectorAll("#wfHost img").forEach(i => {
        i.loading = "eager";
        if (i.getAttribute("src")) i.setAttribute("src", i.getAttribute("src"));
      });
      await new Promise(r => setTimeout(r, 2600));
      return out;
    });
    await ctx.close();
  }

  const at = w => byWidth[w] || {};
  const WS = [320, 390];

  report("C) the sketch role exists and is reachable by cycling the role pill",
    WS.every(w => at(w).hasSketch && at(w).reachedSketch),
    WS.map(w => w + ":" + JSON.stringify(at(w).seenLabels)).join(" | "));

  report("C2) its label fits the ref tile at phone widths without clipping",
    WS.every(w => at(w).tileRendered === true && at(w).allFit === true &&
                  at(w).anyClipped === false && (at(w).escapes || []).length === 0),
    WS.map(w => w + ": rendered=" + at(w).tileRendered + " on=" + at(w).refPageShown +
                " fit=" + at(w).allFit + " clipped=" + at(w).anyClipped +
                " escapes=" + JSON.stringify(at(w).escapes || [])).join(" "));

  report("D) the role sentence keeps all four guarantees — geometry-only, no drawn marks, must be a photo, fixes anatomy",
    WS.every(w => at(w).guarantees && Object.keys(at(w).guarantees).every(k => at(w).guarantees[k])),
    JSON.stringify(at(390).guarantees));

  report("E) the Sketch Pose Control workflow exists and its ROLE MAP binds all three slots",
    WS.every(w => at(w).presetExists && at(w).countsMatch &&
      at(w).roleMap.img1Identity && at(w).roleMap.img2Sketch && at(w).roleMap.img3Optional),
    JSON.stringify(at(390).roleMap));

  report("F) it forbids the three drawing failures and locks the person count",
    WS.every(w => at(w).roleMap && at(w).roleMap.noDrawnMarks &&
      at(w).roleMap.mustBePhotograph && at(w).roleMap.fixesAnatomy && at(w).roleMap.countLock),
    JSON.stringify(at(390).roleMap));

  report("E2) it renders in the workflow grid",
    WS.every(w => at(w).inGrid === true && at(w).cards >= 117),
    WS.map(w => w + ": cards=" + at(w).cards + " inGrid=" + at(w).inGrid).join(" "));

  /* G) card-less workflows must be declared, or every load eats a 404 first.
     v4.79 — this used to read
         /var NO_CARD_JPG=\[\s*"pr-sketchPose"\s*\]/.test(src)
     which pinned the LIST'S CONTENTS rather than the promise the list exists
     to keep. It went red the moment pr-sketchPose.jpg was drawn and the id was
     correctly removed: the assertion failed BECAUSE the product got better,
     which means it was measuring the wrong thing. (Same shape as sweep_v464's
     assertion B and its own assertion G, both already fixed for this reason —
     that makes this the third time on this pattern, so the fix here is
     behavioural rather than another cleverer literal.)

     What the declaration actually promises is a two-way invariant, and both
     halves are now measured instead of described:
       G1  no card-art request 404s — an undeclared missing photo would, which
           is the user-visible cost the list exists to prevent;
       G2  no id sits in the list whose photo DOES exist on disk — a stale
           entry silently keeps a real, shipped photograph off the grid
           forever, and nothing else in the suite would notice.
     Both hold with the list empty, full, or anywhere between. */
  const declared = (() => {
    const m = /var NO_CARD_JPG\s*=\s*\[([^\]]*)\]/.exec(src.replace(/\/\*[\s\S]*?\*\//g, ""));
    return m ? (m[1].match(/"([^"]+)"/g) || []).map(s => s.slice(1, -1)) : null;
  })();
  const cardsDir = path.join(__dirname, "..", "docs", "app", "lib", "wf", "cards5");
  const stale = (declared || []).filter(id => fs.existsSync(path.join(cardsDir, id + ".jpg")));

  report("G1) the workflow grid never requests card art that 404s",
    art404.length === 0 && artOK.size >= 117,
    { missing: art404.slice(0, 8), served: artOK.size });

  report("G2) NO_CARD_JPG declares only ids whose photo is genuinely absent",
    declared !== null && stale.length === 0,
    { declared: declared, staleEntriesHidingRealPhotos: stale });

  report("no page errors", pageErrors.length === 0, pageErrors);

  console.log("      (registry carries " + (src.match(/\{ id:"/g) || []).length +
    " model entries; roles ride the ordered imageUrls array plus the prompt's ROLE MAP, " +
    "so no provider code was needed for the sketch slot)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
