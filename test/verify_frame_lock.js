#!/usr/bin/env node
/* v6.0.0 — THE FRAME LOCK.
   The owner asked a plain question: "if I put in a seated half-body photo,
   do I get my pose and my framing back?" Auditing all 157 workflows
   answered it badly. The thirteen Look Sets say it twice — in the opening
   line and again in the TASK GUARD. Sixty-one others said nothing at all
   about the crop, the camera angle, the subject's scale or the aspect
   ratio: a Relight card, a veil, a petal fall, a dress swap, Makeup Copy.
   A model is free with whatever it is not told, and the request beats the
   prompt only when the request says something — here it said nothing.
   The lock is added once, at the single point where the catalog is
   assembled, so no prompt string is hand-edited and no family is missed.
   Three kinds of workflow are exempt ON PURPOSE and this pins that too: a
   tool whose job IS to change the pose must not be told it may not, and a
   tool that composes a new picture has no IMAGE 1 frame to keep. */
"use strict";
const path = require("path");
const { chromium } = require("playwright");

const PORT = process.env.PORT || 8931;
const URL = "http://127.0.0.1:" + PORT + "/index.html";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

/* builds a new composition, or has no IMAGE 1 to preserve */
const EXEMPT = ["couple-compose", "silhouette-romance",
  "pl-0", "pl-1", "pl-2", "pl-3", "pl-4", "pl-5", "pl-6", "pl-7"];
/* the pose is the very thing it is asked to change */
const POSE_EXEMPT = ["pr-pose"];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForTimeout(2600);

  const R = await page.evaluate(({ exempt, poseExempt }) => {
    const all = (window.HNK_WF_CATALOG || []).flatMap(c => c.items);
    const says = t => /crop|aspect ratio|same pose|framing|composition/i.test(t || "");
    const silent = [], lockedNoPose = [], exemptButLocked = [], toneMissing = [];
    all.forEach(w => {
      const t = w.prompt || "";
      const isExempt = exempt.indexOf(w.id) >= 0;
      if (isExempt) { if (/FRAME LOCK: IMAGE 1's own composition/.test(t)) exemptButLocked.push(w.id); return; }
      if (!says(t)) silent.push(w.id);
      if (/FRAME LOCK: IMAGE 1's own composition/.test(t) &&
          !/pose, hands and body proportions stay/.test(t) &&
          poseExempt.indexOf(w.id) < 0) lockedNoPose.push(w.id);
    });
    /* the twelve that read a reference which could carry its own complexion */
    const toneWanted = ["subject-face", "pr-roFaceRep", "pr-roFaceSwap", "pr-roMkCopy",
      "master-bgfg-replace", "full-look-transfer", "regency-birthday", "dress-reference",
      "couple-compose", "cinematic-poster", "pr-sketchPose", "bridal-decor"];
    toneWanted.forEach(id => {
      const w = all.find(x => x.id === id);
      if (!w) { toneMissing.push(id + " (missing)"); return; }
      if (!/never lightened|natural complexion|leave the skin tone|skin tone exactly as photographed/i.test(w.prompt || ""))
        toneMissing.push(id);
    });
    const locked = all.filter(w => /FRAME LOCK: IMAGE 1's own composition/.test(w.prompt || "")).length;
    return { total: all.length, silent, lockedNoPose, exemptButLocked, toneMissing, locked,
      poseExemptStillLocked: poseExempt.filter(id => {
        const w = all.find(x => x.id === id); return w && /pose, hands and body proportions stay/.test(w.prompt || "");
      }) };
  }, { exempt: EXEMPT, poseExempt: POSE_EXEMPT });

  report("A) every workflow that edits the student's own photograph now says the frame is kept",
    R.silent.length === 0, R.silent.slice(0, 12));

  report("A2) …and it is a real change, not a no-op — the lock is on a substantial share of the catalog",
    R.locked >= 40, { locked: R.locked, total: R.total });

  report("B) a locked workflow also keeps the pose, unless changing the pose is its job",
    R.lockedNoPose.length === 0, R.lockedNoPose);

  report("B2) …and the one whose job IS the pose is not told to keep it",
    R.poseExemptStillLocked.length === 0, R.poseExemptStillLocked);

  report("C) a workflow that composes a new picture is NOT given a frame it does not have",
    R.exemptButLocked.length === 0, R.exemptButLocked);

  report("D) every workflow that reads a reference which could carry its own complexion locks the skin tone",
    R.toneMissing.length === 0, R.toneMissing);

  report("E) no page error while the whole catalog was composed", errs.length === 0, errs.slice(0, 3));

  await browser.close();
  console.log(failures
    ? "\n" + failures + " FAILURE(S) — a photograph could come back re-posed or re-framed with nothing in the request against it."
    : "\nAll checks passed — " + R.locked + " workflows keep the frame, the pose follows unless changing it is the job, and the composers are left free.");
  process.exit(failures ? 1 : 0);
})();
