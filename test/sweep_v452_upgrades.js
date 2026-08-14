/* v4.52.0 regression sweep — no paid RunningHub job left behind.

   RunningHub bills at SUBMIT, not at delivery. Until now every rhGenerate*
   held its taskId in a local variable, so a reload, a crash, or iOS Safari
   discarding a backgrounded tab during a ten-minute video render destroyed
   the only handle to a job the studio had already paid for.

   Pinned contracts:
   A) Every generate wrapper routes its poll through rhPollTracked, so no
      submit can happen without the id being written down.
   B) A submitted job is on the books immediately and survives a reload.
   C) Terminal outcomes strike the id off; a job still running does not.
   D) A finished job can be claimed after the fact — its result lands in the
      Gallery (images) or the video history (videos) and the id is closed.
   E) Ids older than the claim window are never shown, so a stale entry can't
      haunt Home forever.
   F) The Home card only exists when there is something outstanding.
   G) Every new string is translated in all nine base languages and none of
      them leaks an untranslated {N} placeholder into the UI.

   Usage: PORT=8931 node test/sweep_v452_upgrades.js  (serve docs/app first) */
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
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(String(e).slice(0, 200)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  const r = await page.evaluate(async () => {
    const out = {};
    switchPage("pgDash");
    await new Promise(s => setTimeout(s, 200));

    /* A) no submit path bypasses the registry */
    out.A_untracked = [
      ["rhGenerateOne", rhGenerateOne], ["rhGenerateUpscale", rhGenerateUpscale],
      ["rhGenerateUpscaleTransparent", rhGenerateUpscaleTransparent],
      ["rhGenerateVideo", rhGenerateVideo], ["rhGenerateVideoUpscale", rhGenerateVideoUpscale],
      ["rhGenerateT2I", rhGenerateT2I]
    ].filter(p => String(p[1]).indexOf("rhPollTracked") < 0).map(p => p[0]);

    /* F) nothing outstanding -> no card */
    localStorage.removeItem("hnk_ws_rh_jobs");
    renderDashJobs();
    out.F_hiddenWhenEmpty = document.getElementById("dashJobs").style.display === "none";

    /* B) a submitted job is written down at once and reads back */
    rhJobOpen("t-1", { kind: "video", label: "rhart-video/x", prompt: "a bride walking" });
    out.B_stored = JSON.parse(localStorage.getItem("hnk_ws_rh_jobs") || "[]").length === 1;
    out.B_reads = rhJobsLoad().length === 1 && rhJobsLoad()[0].kind === "video";
    renderDashJobs();
    out.F_showsWhenPending = document.getElementById("dashJobs").style.display !== "none";
    out.F_rowNames = document.getElementById("dashJobsList").textContent.indexOf("a bride walking") >= 0;

    /* C) terminal -> struck off */
    rhJobClose("t-1");
    out.C_closed = rhJobsLoad().length === 0;

    /* E) beyond the claim window it is not offered */
    localStorage.setItem("hnk_ws_rh_jobs", JSON.stringify([
      { taskId: "stale", kind: "image", ts: Date.now() - 13 * 3600 * 1000 }
    ]));
    out.E_ttl = rhJobsLoad().length === 0;
    localStorage.removeItem("hnk_ws_rh_jobs");

    /* D) claim a job that finished while the app was away */
    state.rhKey = "test-key";
    const realFetch = window.fetch;
    const stub = status => async function (u, o) {
      if (String(u).indexOf("/query") >= 0) {
        return {
          ok: true, json: async () => status === "SUCCESS"
            ? { status: "SUCCESS", results: [{ url: "https://example/1.mp4", outputType: "video" }] }
            : { status: status }
        };
      }
      return realFetch(u, o);
    };
    const vidBefore = state.vidHist.length;
    window.fetch = stub("SUCCESS");
    rhJobOpen("t-vid", { kind: "video", label: "v", prompt: "p" });
    const d = await rhJobClaim({ taskId: "t-vid", kind: "video", prompt: "p", ts: Date.now() });
    window.fetch = realFetch;
    out.D_state = d.state;
    out.D_n = d.n;
    out.D_landed = state.vidHist.length === vidBefore + 1;
    out.D_closed = rhJobsLoad().filter(j => j.taskId === "t-vid").length === 0;

    /* C2) a job still running keeps its place in the queue */
    window.fetch = stub("RUNNING");
    rhJobOpen("t-run", { kind: "image", label: "v", prompt: "p" });
    const d2 = await rhJobClaim({ taskId: "t-run", kind: "image", prompt: "p", ts: Date.now() });
    window.fetch = realFetch;
    out.C2_state = d2.state;
    out.C2_kept = rhJobsLoad().filter(j => j.taskId === "t-run").length === 1;

    /* C3) a RunningHub-side failure is terminal — nothing left to collect */
    window.fetch = stub("FAILED");
    const d3 = await rhJobClaim({ taskId: "t-run", kind: "image", prompt: "p", ts: Date.now() });
    window.fetch = realFetch;
    out.C3_state = d3.state;
    out.C3_closed = rhJobsLoad().filter(j => j.taskId === "t-run").length === 0;

    /* G) every new string is translated everywhere and renders substituted */
    const KEYS = ["job_h", "job_note", "job_kind_image", "job_kind_video", "job_age_min",
      "job_age_hr", "job_check", "job_discard", "job_recovered", "job_running",
      "job_failed", "job_error", "job_needkey"];
    const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
    out.G_missing = [];
    KEYS.forEach(k => LANGS.forEach(l => {
      const v = TR[k] && TR[k][l];
      if (typeof v !== "string" || !v.trim()) out.G_missing.push(l + "." + k);
    }));
    rhJobOpen("t-2", { kind: "image", label: "v", prompt: "x" });
    renderDashJobs();
    out.G_noRawToken = document.getElementById("dashJobs").textContent.indexOf("{N}") < 0;
    rhJobClose("t-2");

    localStorage.removeItem("hnk_ws_rh_jobs");
    state.rhKey = "";
    return out;
  });

  report("A) every generate wrapper polls through the tracked registry",
    r.A_untracked.length === 0, r.A_untracked);
  report("B) a submitted job is written down at once and reads back",
    r.B_stored && r.B_reads, r);
  report("C) a terminal outcome strikes the id off", r.C_closed, r);
  report("C2) a job still running keeps its place", r.C2_state === "running" && r.C2_kept, r);
  report("C3) a RunningHub-side failure is terminal", r.C3_state === "failed" && r.C3_closed, r);
  report("D) a job that finished while away is claimed into the app",
    r.D_state === "recovered" && r.D_n === 1 && r.D_landed && r.D_closed, r);
  report("E) an id past the claim window is never offered", r.E_ttl, r);
  report("F) Home shows the card only when something is outstanding",
    r.F_hiddenWhenEmpty && r.F_showsWhenPending && r.F_rowNames, r);
  report("G) every new string is translated in all nine languages, none raw",
    r.G_missing.length === 0 && r.G_noRawToken, r.G_missing);

  report("no page errors", pageErrors.length === 0, pageErrors);
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
