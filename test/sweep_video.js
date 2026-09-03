/* Mocked end-to-end check of RunningHub image-to-video generation: save a
   fake key, fill IMAGE 1 + a prompt, GENERATE with the default video model
   (RH Video G Official, built-in — no manual mapping needed), and assert
   the mocked upload -> submit -> query(poll) chain produces a playable
   result — and that the studio KEEPS it.

   v5.86.0 changed what "playable" is allowed to mean, so this check moved
   with it. RunningHub hands back a link that dies in 24 hours; until this
   release that link WAS the result, the page held nothing else, and a
   reload lost the clip outright. Now the page shows the link the instant it
   arrives and, behind that, downloads the file into the Gallery and repaints
   onto the saved copy. So the promise this asserts is the stronger one: the
   result box opens, and it settles on a blob: source backed by real saved
   bytes, with the 24-hour warning down — because that warning belongs to a
   link, not to a file the studio owns. (Pinning src to the raw RunningHub
   URL would now pin the defect: it would pass only while the save was still
   in flight, and would have to be raced to stay green.)

   Also checks the client-side "2 images not supported" guard for the
   Gemini Omni Flash video model (1 or 3 images only).
   Usage: PORT=8931 node test/sweep_video.js   (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 300)));

  await page.addInitScript(`
    window.__rhCalls = [];
    window.__rhBodies = [];
    window.__trCalls = [];   // v4.28 §3.1: Burmese -> English translator hops
    const realFetch = window.fetch;
    window.fetch = function(url, opts){
      var u = String(url);
      if (u.indexOf(":generateContent") >= 0) {
        try { window.__trCalls.push(JSON.parse(opts.body)); } catch(e) { window.__trCalls.push(null); }
        return Promise.resolve(new Response(JSON.stringify({candidates:[{content:{parts:[{text:"TRANSLATED_ENGLISH_PROMPT"}]}}]}), {status:200}));
      }
      if (u.indexOf("mock.runninghub.test") >= 0) {
        var bin = atob("${B64}");
        var bytes = new Uint8Array(bin.length);
        for (var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
        return Promise.resolve(new Response(bytes, {status:200, headers:{"Content-Type":"video/mp4"}}));
      }
      if (u.indexOf("www.runninghub.ai") < 0) return realFetch.apply(this, arguments);
      window.__rhCalls.push(u);
      if (opts && typeof opts.body === "string") {
        try { window.__rhBodies.push({ url: u, body: JSON.parse(opts.body) }); } catch(e) {}
      }
      if (u.indexOf("/openapi/v2/media/upload/binary") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({code:0,message:"success",data:{type:"image",download_url:"https://mock.runninghub.test/up_0.png",fileName:"openapi/up_0.png",size:"100"}}), {status:200}));
      }
      if (u.indexOf("/openapi/v2/query") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({taskId:"mock-vid-1",status:"SUCCESS",errorCode:"",errorMessage:"",results:[{url:"https://mock.runninghub.test/out.mp4",nodeId:"2",outputType:"mp4",text:null}],clientId:"",promptTips:""}), {status:200}));
      }
      if (u.indexOf("/openapi/v2/rhart-video-g-official/image-to-video") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({taskId:"mock-vid-1",status:"RUNNING",errorCode:"",errorMessage:"",results:null,clientId:"mock-client",promptTips:""}), {status:200}));
      }
      return realFetch.apply(this, arguments);
    };
  `);

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  const setup = await page.evaluate(() => {
    window.scrollTo = function(){}; Element.prototype.scrollIntoView = function(){};
    state.rhKey = "TEST_RH_KEY";
    var opt = document.getElementById("selVidModel").querySelector('option[value="rh-video-g-off"]');
    var opt2 = document.getElementById("selVidModel").querySelector('option[value="gemini-omni-video"]');
    return { hasOfficial: !!opt, hasGemini: !!opt2, resOptions: document.getElementById("selVidRes").options.length, durOptions: document.getElementById("selVidDur").options.length };
  });
  console.log("setup:", JSON.stringify(setup));
  if (!setup.hasOfficial || !setup.hasGemini || !setup.resOptions || !setup.durOptions) {
    console.log("FAIL: video model select did not populate correctly");
    await browser.close();
    process.exit(1);
  }

  // v5.55.0 — the old "rejects exactly 2 images" guard pinned a registry-era
  // odd-count note. The fetched doc for gemini-omni-flash/image-to-video
  // declares imageUrls 1..3 with NO odd restriction, so 2 references must now
  // SUBMIT, carrying both URLs in imageUrls. (The oddOnly mechanism stays in
  // the pane for any future model that documents one.)
  const guard = await page.evaluate(async (b64) => {
    window.__rhBodies.length = 0;
    document.getElementById("vidResultBox").className = "card result-box";
    document.getElementById("selVidModel").value = "gemini-omni-video";
    document.getElementById("selVidModel").onchange();
    state.refs[0] = { mime: "image/png", b64: b64, label: "t0" };
    state.refs[1] = { mime: "image/png", b64: b64, label: "t1" };
    state.refs[2] = null;
    document.getElementById("vidPrompt").value = "test prompt";
    document.getElementById("btnVidGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("vidResultBox").className.indexOf("on") < 0; w++) await sleep(50);
    var sub = (window.__rhBodies.find(b => b.url.indexOf("gemini-omni-flash/image-to-video") >= 0) || {}).body || null;
    return { st: document.getElementById("stVidGen").textContent, body: sub };
  }, B64);
  console.log("2-image submit body:", JSON.stringify(guard.body));
  const guardOk = guard.body && Array.isArray(guard.body.imageUrls) && guard.body.imageUrls.length === 2
    && guard.body.duration && guard.body.resolution;

  const result = await page.evaluate(async (b64) => {
    document.getElementById("selVidModel").value = "rh-video-g-off";
    document.getElementById("selVidModel").onchange();
    state.refs[0] = { mime: "image/png", b64: b64, label: "t0" };
    state.refs[1] = null;
    state.refs[2] = null;
    document.getElementById("vidPrompt").value = "subject slowly turns and smiles";
    document.getElementById("btnVidGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const vid = document.getElementById("vidResultVideo");
    for (let w = 0; w < 100 && document.getElementById("vidResultBox").className.indexOf("on") < 0; w++) await sleep(50);
    const opened = document.getElementById("vidResultBox").className.indexOf("on") >= 0;
    /* the link shows first; the saved copy replaces it the moment the bytes
       are home. Both are legitimate states of a working page — only the
       second is the one the studio still has tomorrow, so that is the one
       this waits for. */
    const liveFirst = vid.src === "https://mock.runninghub.test/out.mp4" || vid.src.indexOf("blob:") === 0;
    for (let w = 0; w < 120 && vid.src.indexOf("blob:") !== 0; w++) await sleep(50);
    const rec = state.vidHist[0] || {};
    const ex = document.getElementById("vidExpireNote");
    if (!opened) return "the result box never opened — " + (document.getElementById("stVidGen").textContent || "");
    if (!liveFirst) return "the result box opened on nothing playable: " + vid.src.slice(0, 60);
    if (vid.src.indexOf("blob:") !== 0) return "the clip never moved onto a saved copy: " + vid.src.slice(0, 60);
    if (!(rec.blob && rec.blob.size > 0)) return "the page plays a blob but the take carries no saved bytes";
    if (rec.url !== "https://mock.runninghub.test/out.mp4") return "the take lost the RunningHub link it came from";
    if (ex && ex.style.display !== "none") return "the 24-hour link warning is still up over a saved file";
    return "OK";
  }, B64);

  const calls = await page.evaluate(() => window.__rhCalls);
  console.log("RunningHub calls made:", JSON.stringify(calls));
  console.log(result === "OK" ? "PASS (video: the take opens, then settles on the saved copy the studio keeps)" : ("FAIL: " + result));
  console.log(guardOk ? "PASS (2 references submit per the doc — no invented odd-count rule)" : "FAIL: 2-image submit did not carry both imageUrls");

  // ---- v4.28 §4.5 (W1): the video model label must not credit Gemini ----
  // The id stays `gemini-omni-video` for stored-config compatibility; only the
  // human-facing label changes, because this model runs on RunningHub, not on
  // the user's Gemini key.
  const label = await page.evaluate(() => {
    var o = document.getElementById("selVidModel").querySelector('option[value="gemini-omni-video"]');
    return { id: !!o, text: o ? o.textContent : "" };
  });
  console.log("video model label:", JSON.stringify(label));
  const labelOk = label.id && /RunningHub/i.test(label.text) && !/^Gemini/i.test(label.text.trim());
  console.log(labelOk ? "PASS (W1: video model keeps its id but no longer claims to be a Gemini engine)"
    : ("FAIL (W1 label): " + JSON.stringify(label)));

  // ---- v5.50.0: the Gemini translate bridge is retired — a Burmese video
  // prompt now always sends exactly as written, with the English-recommended
  // hint shown, and no translate call can ever leave the browser. ----
  const MY = "မိန်းကလေးက ဖြည်းဖြည်းချင်း လှည့်ကြည့်ပြီး ပြုံးတယ်";
  const trVid = await page.evaluate(async (args) => {
    var [b64, MY] = args;
    window.__trCalls.length = 0; window.__rhBodies.length = 0;
    document.getElementById("vidResultBox").className = "card result-box";
    document.getElementById("selVidModel").value = "rh-video-g-off";
    document.getElementById("selVidModel").onchange();
    state.refs[0] = { mime: "image/png", b64: b64, label: "t0" };
    state.refs[1] = null; state.refs[2] = null;
    document.getElementById("vidPrompt").value = MY;
    document.getElementById("btnVidGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("vidResultBox").className.indexOf("on") < 0; w++) await sleep(50);
    var sub = (window.__rhBodies.find(b => b.url.indexOf("/image-to-video") >= 0) || {}).body || null;
    return {
      ok: document.getElementById("vidResultBox").className.indexOf("on") >= 0,
      calls: window.__trCalls.length, body: sub,
      hint: document.getElementById("vidTrHint").style.display !== "none"
    };
  }, [B64, MY]);
  console.log("raw Burmese video body:", JSON.stringify(trVid));
  const trVidOk = trVid.ok && trVid.calls === 0 && trVid.body && trVid.hint
    && String(trVid.body.prompt || "").indexOf(MY) >= 0;
  console.log(trVidOk ? "PASS (Burmese video prompt sends raw — no translate call leaves the browser)"
    : ("FAIL (video translate gate): " + JSON.stringify(trVid)));

  const noKeyVid = await page.evaluate(async (args) => {
    var [b64, MY] = args;
    state.key = "";
    window.__trCalls.length = 0; window.__rhBodies.length = 0;
    document.getElementById("vidResultBox").className = "card result-box";
    state.refs[0] = { mime: "image/png", b64: b64, label: "t0" };
    document.getElementById("vidPrompt").value = MY;
    document.getElementById("btnVidGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("vidResultBox").className.indexOf("on") < 0; w++) await sleep(50);
    var sub = (window.__rhBodies.find(b => b.url.indexOf("/image-to-video") >= 0) || {}).body || null;
    var h = document.getElementById("vidTrHint");
    return { ok: document.getElementById("vidResultBox").className.indexOf("on") >= 0,
             calls: window.__trCalls.length, hint: h.style.display !== "none", text: h.textContent,
             raw: !!sub && String(sub.prompt || "").indexOf(MY) >= 0 };
  }, [B64, MY]);
  console.log("video no-key hint:", JSON.stringify(noKeyVid));
  const noKeyVidOk = noKeyVid.ok && noKeyVid.calls === 0 && noKeyVid.hint
    && noKeyVid.text.length > 0 && noKeyVid.raw;
  console.log(noKeyVidOk ? "PASS (no key: inline hint is shown and the raw video prompt still sends)"
    : ("FAIL (video no-key hint): " + JSON.stringify(noKeyVid)));

  const overall = result === "OK" && guardOk && labelOk && trVidOk && noKeyVidOk;
  console.log("\n" + (overall ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(overall ? 0 : 1);
})();
