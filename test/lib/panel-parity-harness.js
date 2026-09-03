/* The one harness both panel-parity tests read the panel through.
 *
 * WHY THIS FILE EXISTS. There were two copies of this, and they had drifted.
 * verify_panel_studio_sync.js booted the panel with nothing but a RunningHub
 * key while its own comment claimed it was "the same signed-in,
 * key-configured student the app is read as" — and
 * verify_panel_page_parity.js, which really did sign in, was the one that
 * found the Home greeting bug. Two harnesses reading the same product in two
 * different states is how a defect hides in the gap between them, so there is
 * one now.
 *
 *   UXP_STUB — the UXP host AND the state: the same account, profile,
 *              entitlement, key and balance reading APP_INIT gives the web
 *              app (tools/build_panel_studio_suites.js). A difference in a
 *              string list then means a difference in the product.
 *   COLLECT  — the walker: visible own-text in DOM order, with the two things
 *              UXP's renderer does to a label that the app's inline flow does
 *              not (see the comments inside it).
 *
 * Both are strings evaluated inside the browser, not functions here. */
"use strict";

const UXP_STUB = `(function(){
  var UID = "77777777-8888-4999-aaaa-bbbbbbbbbbbb";
  var EXP = new Date(Date.now() + 30*86400000).toISOString();
  var PROF = { id: UID, name: "Student Name", email: "student@example.com",
               created_at: "2026-01-15T10:00:00Z", plan_status: "active",
               plan_expires_at: EXP, allowed_devices: 2, is_admin: false, avatar: null };
  var settings = JSON.stringify({
    rhKey: "TEST_RH_KEY", lang: "my",
    accRefresh: "r", accUid: UID, accEmail: "student@example.com",
    accDevId: "11111111-2222-4333-8444-555555555555",
    accProfile: { account: { status: "active" }, license: { active: true, status: "active", expires_at: EXP } },
    accSeenAt: Date.now(),
    /* the app's money strip appears once a balance has been read; the panel's
       does the same, so the stub carries one reading for both */
    /* the queue reading rides along, as the live RunningHub answer carries it:
       the app's money line names running/queued/limit and the panel's does
       too, so the seeded reading has to carry the same shape */
    rhBal: { ts: Date.now(), cur: "USD", bal: 0, queue: { running: 0, queued: 0, limit: 0 } }
  });
  var file = { read: function(){ return Promise.resolve(settings); },
               write: function(t){ settings = t; return Promise.resolve(); } };
  var folder = { getEntry: function(){ return Promise.resolve(file); },
                 createFile: function(){ return Promise.resolve(file); },
                 getEntries: function(){ return Promise.resolve([]); } };
  var uxp = { storage: { localFileSystem: { getDataFolder: function(){ return Promise.resolve(folder); } }, formats: { utf8: "utf8", binary: "binary" } },
              shell: { openExternal: function(){ return Promise.resolve(); }, openPath: function(){ return Promise.resolve(); } },
              entrypoints: { setup: function(){} } };
  var ps = { app: { documents: [] }, core: { executeAsModal: function(){} }, imaging: {},
             action: { batchPlay: function(){ return Promise.resolve([]); } }, constants: {} };
  window.require = function(n){ return n === "photoshop" ? ps : n === "uxp" ? uxp : n === "os" ? { platform: function(){ return "test"; } } : {}; };
  var realFetch = window.fetch.bind(window);
  function json(b, s){ return Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } })); }
  window.fetch = function(url, init){
    url = String(url);
    if (url.indexOf("127.0.0.1") >= 0) return realFetch(url, init);
    /* the same answers APP_INIT gives the web app, in the panel's own shapes */
    if (url.indexOf("/auth/v1/token") >= 0)
      return json({ access_token: "a", refresh_token: "r", expires_in: 7200, user: { id: UID, email: PROF.email } });
    if (url.indexOf("/v1/devices/enroll") >= 0) return json({ ok: true });
    if (url.indexOf("/v1/panel/validate") >= 0)
      return json({ ok: true, lease_token: "L", lease_expires_at: new Date(Date.now() + 3600000).toISOString(),
        entitlement: { account: { status: "active" }, license: { active: true, status: "active", expires_at: EXP },
          permissions: { panel: true, photoshop_panel: true, ccx_download: true, web_app: true } } });
    if (url.indexOf("/rest/v1/profiles") >= 0) return json([PROF]);
    if (url.indexOf("/rest/v1/devices") >= 0) return json([]);
    if (url.indexOf("runninghub.ai") >= 0) return json({ code: 0, data: {} });
    return json({});
  };
})();`;

const COLLECT = `(function(sel){
  var root = document.querySelector(sel);
  if (!root) return ["NO ROOT " + sel];
  root.querySelectorAll(".grp").forEach(function (g) { if (g.className.indexOf("open") < 0) g.className += " open"; });
  var out = [];
  (function walk(e) {
    var cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    /* A button label that wraps is ONE label. The app lets inline flow wrap it
       and the text stays a single node; UXP centres a flex row, so main.js
       (fitBtnIn) splits the label into .icn-l1 + .icn-rest to put the icon on
       line one. Reading those as two strings would report a difference the
       student never sees, so the wrapper is read whole. */
    if (typeof e.__txt === "string") {
      /* THE LABEL, not its line boxes. The app lets inline flow wrap a button
         label and the text stays one node; UXP centres a flex row, so main.js
         (setIcnText/fitBtnIn) splits the label across .icn-l1 + .icn-rest to
         keep the icon on line one — and it splits wherever the line broke,
         which in Burmese is mid-word, with no space to rejoin on. main.js
         keeps the original label on the element as __txt, so that is what is
         read: the string the student sees, however it happened to wrap. */
      var whole = String(e.__txt).replace(/\\s+/g, " ").trim();
      if (whole) out.push(whole);
      return;
    }
    var own = "";
    e.childNodes.forEach(function (n) { if (n.nodeType === 3) own += n.textContent; });
    own = own.replace(/\\s+/g, " ").trim();
    if (own) out.push(own);
    Array.prototype.forEach.call(e.children, walk);
  })(root);
  return out;
})`;

/* v6.56.0 — THE STATE, which no list of strings can see.
 *
 * COLLECT reads the words on the page. Two pages can carry exactly the same
 * words and still be different products: the app's Text to Image opened on
 * AUTO where the panel opened on 1:1, its Retouch Pro showed 100% already
 * chosen where the panel showed three strengths and none picked, and its
 * RETOUCH A tab was lit where the panel's was not — every one of them a chip
 * both surfaces carry, with the "on" class on a different one. A placeholder
 * is worse: it is an attribute, so the walker never reads it at all, and the
 * panel had four languages' worth of its own wording in two prompt boxes.
 *
 * This reads the part of a page that is a CHOICE rather than a word:
 *   ph  — the placeholder of every visible text box
 *   sel — the label of every chip that is currently on, and the option each
 *         visible dropdown is showing
 *
 * Visibility is measured with client rects, not getComputedStyle alone:
 * getComputedStyle on a child of a display:none parent still reports the
 * child's OWN display, so a per-element style check calls hidden things
 * visible — which is exactly how a rail that is correctly hidden on both
 * surfaces read as a difference while the real one (a page with no rail at
 * all) hid behind it. */
const COLLECT_STATE = `(function(sel){
  var root = document.querySelector(sel);
  if (!root) return { ph: ["NO ROOT " + sel], sel: [] };
  root.querySelectorAll(".grp").forEach(function (g) { if (g.className.indexOf("open") < 0) g.className += " open"; });
  function vis(e){
    var cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    return e.getClientRects().length > 0;
  }
  function txt(e){ return (e.textContent || "").replace(/\\s+/g, " ").trim(); }
  var ph = [], on = [];
  root.querySelectorAll("input,textarea").forEach(function (e) {
    if (!vis(e)) return;
    var p = e.getAttribute("placeholder");
    if (p) ph.push(p.replace(/\\s+/g, " ").trim());
  });
  root.querySelectorAll(".chip.on,.rchip.on,.pcard.on,.tabb.on").forEach(function (e) {
    if (!vis(e)) return;
    var t = txt(e);
    if (t) on.push(t);
  });
  root.querySelectorAll("select").forEach(function (e) {
    if (!vis(e)) return;
    var o = e.options && e.options[e.selectedIndex];
    if (o) on.push("[select] " + txt(o));
  });
  return { ph: ph, sel: on };
})`;

/* A positional walk calls a whole list different when ONE item is missing, so
   the two readings are compared as multisets: the answer is the real delta,
   named item by item, which is what a person needs to fix it. */
function stateDiff(app, panel) {
  const out = [];
  [["placeholder", app.ph || [], panel.ph || []], ["selected", app.sel || [], panel.sel || []]].forEach(function (row) {
    const name = row[0], A = row[1], B = row[2];
    const bag = new Map();
    B.forEach(function (x) { bag.set(x, (bag.get(x) || 0) + 1); });
    A.forEach(function (x) {
      const n = bag.get(x) || 0;
      if (n) bag.set(x, n - 1); else out.push(name + " only in the APP: " + JSON.stringify(x));
    });
    bag.forEach(function (n, x) { for (let i = 0; i < n; i++) out.push(name + " only in the PANEL: " + JSON.stringify(x)); });
  });
  return out;
}

module.exports = { UXP_STUB: UXP_STUB, COLLECT: COLLECT, COLLECT_STATE: COLLECT_STATE, stateDiff: stateDiff };
