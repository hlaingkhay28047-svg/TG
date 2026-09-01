"use strict";

(() => {
  /* 20260831e — self-healing freshness: the ?v= stamps only work once the
     DOCUMENT itself is fresh, and phones kept serving a cached index.html
     minutes after a release (three owner reports). On every load, quietly
     re-fetch the document past the HTTP cache; if its asset stamp differs
     from the one this page booted with, reload once — never loops, and
     stays silent offline. */
  (function ensureFreshDocument() {
    try {
      const mine = (document.querySelector('script[src*="admin.js"]') || {}).src || "";
      const stamp = (mine.match(/[?&]v=([0-9a-z]+)/i) || [])[1];
      if (!stamp) return;
      fetch("index.html", { cache: "reload" }).then(r => r.ok ? r.text() : "").then(html => {
        const live = (html.match(/admin\.js\?v=([0-9a-z]+)/i) || [])[1];
        if (live && live !== stamp && sessionStorage.getItem("hnkAdminFresh") !== live) {
          sessionStorage.setItem("hnkAdminFresh", live);
          location.reload();
        }
      }).catch(() => {});
    } catch (e) {}
  })();

  const API = Object.freeze({
    password: "/api/auth/v1/token?grant_type=password",
    refresh: "/api/auth/v1/token?grant_type=refresh_token",
    logout: "/api/auth/v1/logout",
    dashboard: "/api/v1/admin/dashboard",
    visits: "/api/v1/admin/visits",
    students: "/api/v1/admin/students",
    histories: "/api/v1/admin/histories",
    panelVersion: "/api/v1/admin/panel-version",
    artifactInitiate: "/api/v1/admin/panel-artifacts/initiate",
    artifacts: "/api/v1/admin/panel-artifacts",
  });
  const SESSION_KEY = "hnk_admin_sess_v1";
  /* 2026-08-31 — owner instruction: leaving and returning must not sign the
     administrator out, and the console must reopen on the panel they left.
     The session therefore persists in localStorage (still its own isolated
     admin key — never the student session), with the refresh-token grant
     reviving expired access tokens on return. Sign out remains the one way
     to end it, and it clears every copy. */
  const PANEL_KEY = "hnk_admin_panel_v1";
  const MUTATION_KEY_PREFIX = "hnk_admin_mutation_v1";
  const ARTIFACT_STATE_KEY = "hnk_admin_artifact_upload_v1";
  const CLIENT_TYPE = "admin";
  const ARTIFACT_CHUNK_SIZE = 4 * 1024 * 1024;
  const MAX_ARTIFACT_SIZE = 512 * 1024 * 1024;

  /* 2026-09-01 — the console speaks the owner's language. English lives in
     the markup and in the code literals below (one source of truth, no
     drift); only Burmese lives in this table. applyI18n snapshots each
     element's English once, so switching back restores it exactly. Burmese
     is the default because the owner runs this console every day; the
     choice is one tap and persists per device. */
  const LANG_KEY = "hnk_admin_lang_v1";
  const MY = {
    "skip": "Admin အကြောင်းအရာသို့ ကျော်သွားရန်",
    "gate.checking": "Admin ဝင်ခွင့် စစ်နေသည်…",
    "gate.checkingSub": "ဒီ session ကို HNK နဲ့ လုံခြုံစွာ အတည်ပြုနေပါတယ်။",
    "gate.eyebrow": "ADMIN ထိန်းချုပ်ခန်း",
    "gate.signin": "Admin အဖြစ် ဝင်ရန်",
    "gate.signinSub": "Admin အကောင့်နဲ့ ဝင်ပါ။ ဒီ session က ဒီစက်မှာ ဆက်ဝင်ထားပြီး ကျောင်းသား session ကို ဘယ်တော့မှ admin မဖြစ်စေပါ။",
    "f.email": "အီးမေးလ်",
    "f.password": "စကားဝှက်",
    "gate.continue": "လုံခြုံစွာ ဆက်သွားရန်",
    "gate.backApp": "ကျောင်းသား App သို့ ပြန်သွားရန်",
    "gate.privacy": "စကားဝှက်ကို တူညီတဲ့ origin ရဲ့ လုံခြုံတဲ့ endpoint ကိုသာ ပို့ပြီး ဒီစာမျက်နှာမှာ လုံးဝ မသိမ်းပါ။",
    "gate.accessEyebrow": "ADMIN ဝင်ခွင့်",
    "gate.forbidden": "ခွင့်ပြုချက် မရှိပါ",
    "gate.forbiddenSub": "ဒီစာမျက်နှာက HNK admin တွေအတွက်သာ ဖြစ်ပါတယ်။ ကျောင်းသားအကောင့်နဲ့ ဖွင့်လို့ မရပါ။",
    "gate.retry": "ထပ်စစ်ရန်",
    "gate.other": "အခြား admin နဲ့ ဝင်ရန်",
    "brand.name": "ထိန်းချုပ်ခန်း",
    "brand.sub": "Production စီမံခန့်ခွဲမှု",
    "nav.overview": "ခြုံငုံကြည့်",
    "nav.students": "ကျောင်းသားများ",
    "nav.history": "လုပ်ဆောင်မှု မှတ်တမ်း",
    "nav.security": "လုံခြုံရေး & Panel",
    "side.authorized": "ဆာဗာက အတည်ပြုပြီး",
    "side.studentApp": "ကျောင်းသား App",
    "top.signout": "ထွက်ရန်",
    "top.bell": "စောင့်ဆိုင်းနေတဲ့ ကျောင်းသားများ",
    "top.refresh": "အချက်အလက် ပြန်ခေါ်ရန်",
    "top.menu": "Admin မီနူး ဖွင့်ရန်",
    "ov.eyebrow": "လက်ရှိ လည်ပတ်မှု",
    "ov.head": "ကျောင်းသား ဝင်ခွင့် ခြုံငုံ",
    "ov.sub": "အကောင့်၊ License၊ စက်နဲ့ session အခြေအနေ — ဆာဗာက တိုက်ရိုက်။",
    "ov.recentEyebrow": "နောက်ဆုံး ဝင်ရောက်မှု",
    "ov.latest": "နောက်ဆုံး login များ",
    "ov.viewAll": "အားလုံးကြည့်",
    "th.student": "ကျောင်းသား",
    "th.device": "စက်",
    "th.time": "အချိန်",
    "th.result": "ရလဒ်",
    "ov.noLogins": "မကြာသေးမီ login မရှိပါ။",
    "ov.quickEyebrow": "အမြန် သုံးသပ်",
    "ov.attention": "ဂရုစိုက်ရန်",
    "ov.reviewPending": "စောင့်ဆိုင်းနေသူများ ကြည့်ရန်",
    "ov.visitsEyebrow": "ဝဘ်ဆိုက် လာရောက်မှု · ရက် ၃၀",
    "ov.visitsHead": "Landing ဝင်ရောက်မှု",
    "ov.rooms": "အဝင်အများဆုံး စာမျက်နှာများ",
    "ov.noVisits": "လာရောက်မှု မှတ်တမ်း မရှိသေးပါ။",
    "ov.growthEyebrow": "ကျောင်းသားအသစ် · ရက် ၃၀",
    "ov.growthHead": "စာရင်းသွင်းမှု",
    "ov.noGrowth": "ဒီကာလအတွင်း စာရင်းသွင်းသူ မရှိပါ။",
    "ov.newTotal": "ရက် ၃၀ စုစုပေါင်း",
    "ov.newToday": "ဒီနေ့",
    "ch.visits": "နေ့စဉ် လာရောက်မှု",
    "ch.signups": "နေ့စဉ် စာရင်းသွင်းမှု",
    "ch.peak": "အများဆုံး",
    "st.eyebrow": "ကျောင်းသား စီမံခန့်ခွဲမှု",
    "st.head": "အကောင့်နဲ့ License များ",
    "st.sub": "ရှာဖွေ၊ သုံးသပ်ပြီး မှတ်တမ်းတင်ထားတဲ့ လုပ်ဆောင်ချက်တွေ လုပ်ပါ။",
    "st.refresh": "စာရင်း ပြန်ခေါ်",
    "st.searchLabel": "ကျောင်းသား ရှာရန်",
    "st.statusLabel": "အကောင့် အခြေအနေ",
    "st.allStates": "အခြေအနေ အားလုံး",
    "s.pending": "စောင့်ဆိုင်းဆဲ",
    "s.active": "အသုံးပြုနေ",
    "s.suspended": "ယာယီပိတ်",
    "s.expired": "သက်တမ်းကုန်",
    "s.banned": "ပိတ်ပင်",
    "s.rejected": "ငြင်းပယ်",
    "st.licenseLabel": "License အခြေအနေ",
    "st.allLicenses": "License အားလုံး",
    "st.licActive": "License သက်တမ်းရှိ",
    "st.licNone": "License မရှိ",
    "st.apply": "စစ်ထုတ်ရန်",
    "th.account": "အကောင့်",
    "th.license": "License",
    "th.devices": "စက်များ",
    "th.lastActive": "နောက်ဆုံး လှုပ်ရှားမှု",
    "th.open": "ဖွင့်",
    "st.empty": "ဒီအခြေအနေနဲ့ ကိုက်ညီတဲ့ ကျောင်းသား မရှိပါ။",
    "pg.prev": "နောက်သို့",
    "pg.next": "ရှေ့သို့",
    "pg.page": "စာမျက်နှာ",
    "hi.eyebrow": "စစ်ဆေးမှု မှတ်တမ်း",
    "hi.head": "Login၊ စက်၊ download နဲ့ admin လုပ်ဆောင်မှုများ",
    "hi.sub": "ဆာဗာဘက်က မှတ်တမ်းတွေကို ရှာလို့ရပြီး ဒီမှာ ပြင်လို့ မရပါ။",
    "hi.refresh": "မှတ်တမ်း ပြန်ခေါ်",
    "hi.searchLabel": "မှတ်တမ်း ရှာရန်",
    "hi.typeLabel": "လုပ်ဆောင်မှု အမျိုးအစား",
    "hi.all": "အားလုံး",
    "hi.logins": "Login များ",
    "hi.failed": "မအောင်မြင်တဲ့ login",
    "hi.devices": "စက်များ",
    "hi.downloads": "CCX download များ",
    "hi.licenses": "License ပြောင်းလဲမှု",
    "hi.accounts": "အကောင့် လုပ်ဆောင်ချက်",
    "hi.admins": "Admin လုပ်ဆောင်ချက်",
    "hi.from": "မှ",
    "hi.to": "အထိ",
    "hi.filter": "စစ်ထုတ်",
    "th.activity": "လုပ်ဆောင်မှု",
    "th.deviceApp": "စက် / App",
    "hi.empty": "ကိုက်ညီတဲ့ မှတ်တမ်း မရှိပါ။",
    "se.eyebrow": "လုံခြုံရေး & ထုတ်ဝေမှု",
    "se.head": "Panel မူဝါဒနဲ့ admin ကာကွယ်မှု",
    "se.sub": "အနည်းဆုံး ဗားရှင်း သတ်မှတ်ချက်နဲ့ panel ထုတ်ဝေမှု ထိန်းချုပ်မှု။",
    "se.psEyebrow": "PHOTOSHOP PANEL",
    "se.versionSub": "အနည်းဆုံးဗားရှင်းထက် ဟောင်းတဲ့ panel တွေ Update Required ပြပါမယ်။",
    "se.latest": "နောက်ဆုံး ဗားရှင်း",
    "se.minimum": "အနည်းဆုံး ဗားရှင်း",
    "se.saveVersion": "ဗားရှင်း မူဝါဒ သိမ်းရန်",
    "se.artEyebrow": "သီးသန့် PANEL ဖိုင်",
    "se.artHead": "တင်၊ စစ်ပြီး ထုတ်ဝေရန်",
    "se.artSub": "ဖိုင်က ဒီ tab ရဲ့ memory ထဲမှာပဲ ရှိပါတယ်။ HNK က ဒီမှာပဲ hash တွက်၊ စစ်ပြီးသား အပိုင်းတွေကို သီးသန့် သိုလှောင်ခန်းသို့ တင်၊ အပြီးသတ်မှသာ ဗားရှင်းကို ဖွင့်ပေးပါတယ်။",
    "se.relVersion": "ထုတ်ဝေမယ့် ဗားရှင်း",
    "se.package": "Panel ဖိုင်",
    "se.choose": "Creative Cloud panel ဖိုင် ရွေးပါ။ အများဆုံး 512 MiB။",
    "se.waiting": "ဖိုင် စောင့်နေသည်",
    "se.upload": "တင်၊ စစ် & ထုတ်ဝေရန်",
    "se.resume": "ဆက်တင်လို့ရမရ စစ်ရန်",
    "dl.eyebrow": "ကျောင်းသား အသေးစိတ်",
    "dl.permissions": "ဝင်ခွင့် ခွင့်ပြုချက်များ",
    "dl.devices": "မှတ်ပုံတင်ထားသော စက်များ",
    "dl.accountActions": "အကောင့် လုပ်ဆောင်ချက်များ",
    "dl.extendBy": "သက်တမ်းတိုးရန်",
    "dl.extend": "License တိုးရန်",
    "dl.customExpiry": "စိတ်ကြိုက် ကုန်ဆုံးရက်",
    "dl.setExpiry": "ကုန်ဆုံးရက် သတ်မှတ်",
    "dl.secDevices": "လုံခြုံရေး & စက်များ",
    "dl.setDevices": "စက်အရေအတွက် သတ်မှတ်",
    "dl.recent": "မကြာသေးမီ မှတ်တမ်း",
    "dl.openHistory": "မှတ်တမ်းအပြည့် ဖွင့်",
    "dl.noHistory": "မှတ်တမ်း မရှိသေးပါ။",
    "dl.viewDetails": "အသေးစိတ် ကြည့်",
    "cf.eyebrow": "ADMIN လုပ်ဆောင်ချက် အတည်ပြုရန်",
    "cf.title": "အတည်ပြုမလား",
    "cf.cancel": "မလုပ်တော့",
    "cf.confirm": "အတည်ပြု",
    "ph.searchStudents": "အမည် သို့ အီးမေးလ် ရှာရန်",
    "ph.searchActivity": "ကျောင်းသား၊ အီးမေးလ်၊ စက် သို့ လုပ်ဆောင်ချက်",
    "m.total": "စုစုပေါင်း ကျောင်းသား",
    "m.active": "အသုံးပြုနေသူ",
    "m.pending": "စောင့်ဆိုင်းဆဲ",
    "m.expired": "သက်တမ်းကုန်",
    "m.suspended": "ယာယီပိတ်",
    "m.online": "ယခု အွန်လိုင်း",
    "m.expiring": "မကြာမီ ကုန်မည်",
    "m.live": "ဆာဗာ တိုက်ရိုက် ကိန်း",
    "m.updated": "မွမ်းမံချိန်",
    "v.total30": "ရက် ၃၀ စုစုပေါင်း",
    "v.latestDay": "နောက်ဆုံးနေ့",
    "d.unknownDevice": "မသိသော စက်",
    "r.success": "အောင်မြင်",
    "r.failed": "မအောင်မြင်",
    "r.denied": "ငြင်းပယ်",
    "r.issued": "ထုတ်ပေးပြီး",
    "r.downloaded": "download ပြီး",
    "r.invalid": "မမှန်ကန်",
    "r.empty": "မရှိ",
    "e.login": "ဝင်ရောက်",
    "e.logout": "ထွက်",
    "e.refresh": "Session သက်တမ်းတိုး",
    "e.failedLogin": "ဝင်ရန် မအောင်မြင်",
    "e.forcedLogout": "အတင်း ထုတ်",
    "e.passwordReset": "စကားဝှက် reset",
    "e.download": "Download",
    "e.activity": "လုပ်ဆောင်မှု",
    "d.starts": "စတင်",
    "d.expires": "ကုန်ဆုံး",
    "d.lastLogin": "နောက်ဆုံး login",
    "d.lastDownload": "နောက်ဆုံး download",
    "d.phone": "ဖုန်း",
    "d.computer": "ကွန်ပျူတာ",
    "d.registered": "မှတ်ပုံတင်ပြီး",
    "d.notRegistered": "မမှတ်ပုံတင်ရသေး",
    "p.webApp": "ကျောင်းသား Web App",
    "p.ccx": "Panel download",
    "p.panel": "Photoshop Panel",
    "act.approve": "ခွင့်ပြု",
    "act.reject": "ငြင်းပယ်",
    "act.activate": "ဖွင့်",
    "act.suspend": "ယာယီပိတ်",
    "act.ban": "ပိတ်ပင်",
    "act.reset": "စကားဝှက် reset ပို့",
    "act.forceLogout": "အတင်း ထွက်စေ",
    "act.resetPhone": "ဖုန်း Reset",
    "act.resetComputer": "ကွန်ပျူတာ Reset",
    "msg.pickExpiry": "စိတ်ကြိုက် ကုန်ဆုံးရက်ကို အရင်ရွေးပါ။",
    "msg.versionSaved": "Panel ဗားရှင်း မူဝါဒ သိမ်းပြီးပါပြီ။",
    "msg.deviceRange": "စက်အရေအတွက် ၁ မှ ၂၀ ကြား ဖြစ်ရပါမယ်။",
    "lang.aria": "ဘာသာစကား · Language",
  };
  let LANG = "my";
  try { const stored = localStorage.getItem(LANG_KEY); if (stored === "en" || stored === "my") LANG = stored; } catch (_) { }
  /* English is whatever the markup/code already says — snapshot it once so a
     switch back is exact, never a second translation table drifting away. */
  const EN_SNAP = new Map();
  function t(key, english) { return (LANG === "my" && MY[key]) ? MY[key] : english; }
  function applyI18n() {
    document.documentElement.lang = LANG === "my" ? "my" : "en";
    $$("[data-i18n]").forEach(el => {
      const key = el.dataset.i18n;
      if (!EN_SNAP.has(key)) EN_SNAP.set(key, el.textContent);
      el.textContent = t(key, EN_SNAP.get(key));
    });
    $$("[data-i18n-ph]").forEach(el => {
      const key = el.dataset.i18nPh;
      if (!EN_SNAP.has("ph:" + key)) EN_SNAP.set("ph:" + key, el.getAttribute("placeholder") || "");
      el.setAttribute("placeholder", t(key, EN_SNAP.get("ph:" + key)));
    });
    $$("[data-i18n-al]").forEach(el => {
      const key = el.dataset.i18nAl;
      if (!EN_SNAP.has("al:" + key)) EN_SNAP.set("al:" + key, el.getAttribute("aria-label") || "");
      el.setAttribute("aria-label", t(key, EN_SNAP.get("al:" + key)));
    });
    const label = $("#langLabel");
    if (label) label.textContent = LANG === "my" ? "EN" : "MY";
    const toggle = $("#langToggle");
    if (toggle) toggle.setAttribute("aria-label", t("lang.aria", "Language · ဘာသာစကား"));
  }
  const pageSize = 20;
  const state = { studentPage: 1, historyPage: 1, studentTotal: 0, historyTotal: 0,
    selected: null, loading: false, artifactFile: null, artifactBusy: false };
  let refreshInFlight = null;
  let sessionGeneration = 0;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  function newMutationId() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, "0"));
    return `${hex.slice(0,4).join("")}-${hex.slice(4,6).join("")}-${hex.slice(6,8).join("")}-${hex.slice(8,10).join("")}-${hex.slice(10).join("")}`;
  }

  function stablePayload(value) {
    if (Array.isArray(value)) return `[${value.map(stablePayload).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stablePayload(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  async function mutationFor(scope, payload) {
    const digest = await crypto.subtle.digest("SHA-256",
      new TextEncoder().encode(`${scope}\n${stablePayload(payload)}`));
    const fingerprint = [...new Uint8Array(digest)]
      .map(value => value.toString(16).padStart(2, "0")).join("");
    const key = `${MUTATION_KEY_PREFIX}:${scope}:${fingerprint}`;
    const stored = sessionStorage.getItem(key);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored || "")) {
      return { id: stored, fingerprint, key };
    }
    const mutation = { id: newMutationId(), fingerprint, key };
    sessionStorage.setItem(key, mutation.id);
    return mutation;
  }

  function clearMutation(mutation) {
    if (mutation && sessionStorage.getItem(mutation.key) === mutation.id) {
      sessionStorage.removeItem(mutation.key);
    }
  }

  function readSession() {
    try {
      const persisted = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (persisted) return persisted;
      /* a session from the tab-scoped era migrates forward once */
      const legacy = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
      if (legacy) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(legacy));
        sessionStorage.removeItem(SESSION_KEY);
        return legacy;
      }
      return {};
    } catch (_) { return {}; }
  }

  function saveSession(next) {
    sessionGeneration++;
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch (_) {}
  }

  function clearSession() {
    sessionGeneration++;
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
    try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
  }

  function sessionEnvelope(body, current = {}) {
    const user = body.user || current.user || {};
    return {
      access: body.access_token || body.access || current.access || current.access_token || "",
      refresh: body.refresh_token || body.refresh || current.refresh || current.refresh_token || "",
      access_token: body.access_token || body.access || current.access_token || current.access || "",
      refresh_token: body.refresh_token || body.refresh || current.refresh_token || current.refresh || "",
      expires_at: body.expires_at || current.expires_at || null,
      session_id: body.session_id || current.session_id || null,
      uid: user.id || current.uid || "",
      email: user.email || current.email || "",
      user,
      client_type: CLIENT_TYPE,
    };
  }

  function accessToken() {
    const session = readSession();
    return session.access || session.access_token || "";
  }

  function refreshToken() {
    const session = readSession();
    return session.refresh || session.refresh_token || "";
  }

  async function refreshSession() {
    if (refreshInFlight) return refreshInFlight;
    const token = refreshToken();
    if (!token) return false;
    const generation = sessionGeneration;
    const request = (async () => {
      let response;
      try {
        response = await fetch(API.refresh, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ refresh_token: token, client_type: "admin" }),
        });
      } catch (_) { return false; }
      if (!response.ok || generation !== sessionGeneration) return false;
      let body;
      try { body = await response.json(); } catch (_) { return false; }
      if (generation !== sessionGeneration) return false;
      saveSession(sessionEnvelope(body, readSession()));
      return true;
    })();
    refreshInFlight = request;
    try { return await request; }
    finally { if (refreshInFlight === request) refreshInFlight = null; }
  }

  async function api(path, options = {}, retried = false) {
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    const token = accessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    let response;
    try { response = await fetch(path, { ...options, headers, credentials: "same-origin" }); }
    catch (_) { throw Object.assign(new Error("The server could not be reached."), { status: 0 }); }
    if (response.status === 401 && !retried) {
      if (token && accessToken() && accessToken() !== token) return api(path, options, true);
      if (await refreshSession()) return api(path, options, true);
    }
    let body = {};
    try { body = await response.json(); } catch (_) { body = {}; }
    if (!response.ok) {
      const message = body.message || body.msg || body.error || `Request failed (${response.status})`;
      throw Object.assign(new Error(message), { status: response.status, body });
    }
    return body;
  }

  async function adminPasswordLogin(email, password) {
    let response;
    try {
      response = await fetch(API.password, {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password, client_type: "admin" }),
      });
    } catch (_) { throw Object.assign(new Error("The server could not be reached."), { status: 0 }); }
    let body = {};
    try { body = await response.json(); } catch (_) {}
    if (!response.ok || !(body.access_token || body.access)) {
      throw Object.assign(new Error(body.message || body.msg || body.error || "Administrator sign-in failed."),
        { status: response.status, body });
    }
    const session = sessionEnvelope(body);
    saveSession(session);
    return session;
  }

  async function signOutAdmin(message = "Administrator session ended.") {
    const session = readSession();
    const bearer = session.access || session.access_token || "";
    clearSession();
    try {
      await fetch(API.logout, {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json",
          ...(bearer ? { "Authorization": `Bearer ${bearer}` } : {}) },
        credentials: "same-origin",
        body: JSON.stringify({ refresh_token: session.refresh || session.refresh_token || "", client_type: "admin" }),
      });
    } catch (_) {}
    showLogin(message);
  }

  function notify(message, kind = "ok") {
    const toast = $("#liveStatus");
    toast.textContent = message;
    toast.className = `toast on ${kind}`;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { toast.className = "toast"; }, 4200);
  }

  function text(value, fallback = "—") {
    return value === null || value === undefined || value === "" ? fallback : String(value);
  }

  function title(value) {
    return text(value, "unknown").replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase());
  }

  function formatDate(value, dateOnly = false) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return text(value);
    return new Intl.DateTimeFormat(undefined, dateOnly
      ? { year: "numeric", month: "short", day: "numeric" }
      : { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function node(tag, attrs = {}, children = []) {
    const element = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === "className") element.className = value;
      else if (key === "text") element.textContent = value;
      else if (key === "dataset") Object.assign(element.dataset, value);
      else if (key in element && key !== "role") element[key] = value;
      else element.setAttribute(key, value);
    });
    (Array.isArray(children) ? children : [children]).filter(Boolean).forEach(child => element.append(child));
    return element;
  }

  function statusPill(value) {
    const normalized = text(value, "unknown").toLowerCase().replaceAll(" ", "_");
    const WORDS = { pending: "s.pending", active: "s.active", suspended: "s.suspended",
      expired: "s.expired", banned: "s.banned", rejected: "s.rejected",
      success: "r.success", failed: "r.failed", failure: "r.failed", denied: "r.denied",
      issued: "r.issued", downloaded: "r.downloaded", invalid: "r.invalid", empty: "r.empty" };
    const label = WORDS[normalized] ? t(WORDS[normalized], title(normalized)) : title(normalized);
    return node("span", { className: `status-pill ${normalized}`, text: label });
  }

  function normalizeList(body, keys) {
    for (const key of keys) if (Array.isArray(body && body[key])) return body[key];
    if (Array.isArray(body)) return body;
    return [];
  }

  function count(body, ...keys) {
    for (const key of keys) if (Number.isFinite(Number(body && body[key]))) return Number(body[key]);
    return 0;
  }

  function hideAuthSurfaces() {
    $$('dialog[open]').forEach(dialog => dialog.close());
    ["#adminChecking", "#adminLogin", "#adminForbidden"].forEach(selector => { $(selector).hidden = true; });
    $("#adminApp").hidden = true;
  }

  function setFormStatus(selector, message = "", ok = false) {
    const status = $(selector);
    status.textContent = message;
    status.className = `form-status${ok ? " ok" : ""}`;
  }

  function showLogin(message = "") {
    hideAuthSurfaces();
    $("#adminLogin").hidden = false;
    setFormStatus("#adminLoginStatus", message);
    $("#adminLoginPassword").value = "";
    requestAnimationFrame(() => $("#adminLoginEmail").focus());
  }

  function showForbidden(message = "Admin access was not authorized by the server.") {
    hideAuthSurfaces();
    $("#adminForbidden").hidden = false;
    $("#adminForbidden p:last-of-type").textContent = message;
  }

  function showApp(body) {
    hideAuthSurfaces();
    $("#adminApp").hidden = false;
    const user = body.user || body.admin || readSession();
    const display = user.name || user.full_name || user.email || "Administrator";
    $("#adminName").textContent = display;
    $("#adminEmail").textContent = user.email || "";
    $("#adminInitial").textContent = display.trim().slice(0, 1).toUpperCase() || "A";
  }

  function metricsFrom(body) {
    return body.metrics || body.counts || body.dashboard || body;
  }


  /* 2026-09-01 — two small time charts, built from the data the console
     already fetches. One measure per chart on one axis (never a second
     y-scale), one hue per chart stepped for this dark surface and validated
     for contrast and colour-vision separation, thin bars with rounded ends
     on a recessive baseline, and a native <title> on every bar so hover and
     screen readers read the same day. The numbers stay in the rows beside
     the chart, so the picture is never the only way to read the data. */
  /* The SVG namespace is read off the sprite already in the markup: this
     file may not contain an absolute URL literal (same-origin contract,
     pinned by verify_unified_frontend), and the parser knows it anyway. */
  const SVGNS = (document.querySelector("svg.svg-defs") || {}).namespaceURI || null;
  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVGNS, tag);
    for (const key in attrs) if (attrs[key] != null) el.setAttribute(key, String(attrs[key]));
    return el;
  }
  function dayChart(series, opts) {
    /* series: [{ day, hits }] newest first — drawn oldest → newest */
    const rows = series.slice(0, 30).reverse();
    const W = 320, H = 96, PAD = 10, base = H - 16;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart-svg " + (opts.tone || ""),
      role: "img", "aria-label": opts.label });
    svg.appendChild(svgEl("line", { class: "chart-base", x1: 0, y1: base + 3, x2: W, y2: base + 3 }));
    if (!rows.length) return svg;
    const peak = Math.max(1, ...rows.map(r => Number(r.hits) || 0));
    const step = (W - PAD * 2) / rows.length;
    const barW = Math.max(3, Math.min(10, step - 2));   /* 2px surface gap */
    rows.forEach((row, i) => {
      const value = Number(row.hits) || 0;
      const height = Math.max(value > 0 ? 3 : 0, Math.round((value / peak) * (base - 12)));
      const bar = svgEl("rect", { class: "chart-bar", x: (PAD + i * step + (step - barW) / 2).toFixed(1),
        y: base - height, width: barW.toFixed(1), height, rx: Math.min(2, barW / 2) });
      bar.appendChild(svgEl("title", {})).textContent = `${formatDate(row.day, true)} · ${value}`;
      svg.appendChild(bar);
    });
    const peakLabel = svgEl("text", { class: "chart-peak", x: W - 2, y: 11, "text-anchor": "end" });
    peakLabel.textContent = `${t("ch.peak", "Peak")} ${peak}`;
    svg.appendChild(peakLabel);
    return svg;
  }
  function paintChart(host, series, opts) {
    const figure = $(host);
    if (!figure) return;
    figure.replaceChildren(dayChart(series, opts));
  }
  function renderGrowth(body) {
    const card = $("#growthCard");
    if (!card) return;
    const days = Array.isArray(body && body.signups) ? body.signups : [];
    const total = days.reduce((n, row) => n + (Number(row.hits) || 0), 0);
    const today = days.length ? Number(days[0].hits) || 0 : 0;
    $("#growthSummary").replaceChildren(...[
      [t("ov.newTotal", "Last 30 days"), total], [t("ov.newToday", "Today"), today],
    ].map(([label, value]) => node("div", { className: "attention-row" },
      [node("span", { text: label }), node("b", { text: String(value) })])));
    paintChart("#growthChart", days, { tone: "gold", label: t("ch.signups", "Signups per day") });
    $("#growthEmpty").hidden = total > 0;
    card.hidden = false;
  }
  /* The bell counts exactly what the Needs-attention card counts: accounts
     waiting for the owner's decision. Zero pending hides the badge. */
  function renderAlerts(metrics) {
    const bell = $("#alertBell"), badge = $("#alertBadge");
    if (!bell || !badge) return;
    const pending = count(metrics, "pending_students", "pending");
    badge.textContent = String(pending > 99 ? "99+" : pending);
    badge.hidden = !pending;
    bell.classList.toggle("has-alerts", !!pending);
  }

  function renderDashboard(body) {
    const metrics = metricsFrom(body);
    const definitions = [
      [t("m.total", "Total students"), count(metrics, "total_students", "total"), "◎", ""],
      [t("m.active", "Active students"), count(metrics, "active_students", "active"), "✓", "good"],
      [t("m.pending", "Pending approval"), count(metrics, "pending_students", "pending"), "◷", "warn"],
      [t("m.expired", "Expired"), count(metrics, "expired_students", "expired"), "!", "danger"],
      [t("m.suspended", "Suspended"), count(metrics, "suspended_students", "suspended"), "Ⅱ", "danger"],
      [t("m.online", "Online now"), count(metrics, "online_students", "online"), "●", "good"],
      [t("m.expiring", "Expiring soon"), count(metrics, "expiring_soon"), "⌛", "warn"],
    ];
    const grid = $("#metricGrid");
    grid.replaceChildren(...definitions.map(([label, value, icon, tone]) => node("article", { className: `metric ${tone}` }, [
      node("div", { className: "metric-top" }, [node("span", { text: label }), node("span", { className: "metric-icon", text: icon, "aria-hidden": "true" })]),
      node("b", { text: String(value) }), node("span", { text: t("m.live", "Live server count") }),
    ])));
    $("#overviewUpdated").dateTime = new Date().toISOString();
    $("#overviewUpdated").textContent = `${t("m.updated", "Updated")} ${formatDate(new Date())}`;

    const logins = normalizeList(body, ["latest_logins", "logins", "recent_logins"]);
    const rows = logins.map(item => node("tr", {}, [
      node("td", {}, person(item)),
      node("td", { text: prettyDevice(item.device_name || item.device_type) || t("d.unknownDevice", "Unknown device") }),
      node("td", { className: "cell-time", text: formatDate(item.login_at || item.created_at || item.time) }),
      node("td", {}, statusPill(item.result || item.status || "success")),
    ]));
    $("#latestLogins").replaceChildren(...rows);
    $("#latestCards").replaceChildren(...logins.map(item => node("article", { className: "history-card" }, [
      node("div", { className: "history-card-top" }, [
        node("b", { text: formatDate(item.login_at || item.created_at || item.time) }),
        statusPill(item.result || item.status || "success")]),
      node("div", {}, person(item)),
      node("div", { className: "history-card-meta" }, [
        node("span", { text: prettyDevice(item.device_name || item.device_type) || t("d.unknownDevice", "Unknown device") })]),
    ])));
    $("#latestEmpty").hidden = rows.length > 0;

    const attention = [
      [t("s.pending", "Pending"), count(metrics, "pending_students", "pending")],
      [t("s.expired", "Expired"), count(metrics, "expired_students", "expired")],
      [t("m.expiring", "Expiring soon"), count(metrics, "expiring_soon")],
    ];
    $("#attentionList").replaceChildren(...attention.map(([label, value]) => node("div", { className: "attention-row" }, [node("span", { text: label }), node("b", { text: String(value) })])));
    renderAlerts(metrics);
    renderGrowth(body);
  }

  function person(item) {
    const name = item.name || item.full_name || item.student_name || item.email || "Student";
    /* v5.49.0 — members' own profile photos. The value is API text, so it is
       accepted ONLY as a small base64 image data URL (the same bound the
       schema enforces); anything else falls back to the initial badge. */
    const photo = typeof item.avatar === "string" && item.avatar.length <= 98304 &&
      /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(item.avatar) ? item.avatar : "";
    const badge = photo
      ? node("img", { className: "avatar avatar-photo", src: photo, alt: "", "aria-hidden": "true" })
      : node("span", { className: "avatar", text: name.slice(0, 1).toUpperCase(), "aria-hidden": "true" });
    /* v5.62.1 — when no display name exists, `name` already IS the email;
       repeating it as the small line doubled every row (owner, phone
       screenshot). The sub-line renders only when it adds information. */
    const email = item.email || item.student_email || "";
    const line = [node("b", { text: name })];
    if (email && email.trim().toLowerCase() !== name.trim().toLowerCase()) line.push(node("small", { text: email }));
    /* 2026-09-01 — the stylesheet has always described .person (avatar beside
       a stacked name/email), but nothing ever wore the class: in the wide
       tables the inline <b> and <small> ran into each other mid-word. The
       row now IS a .person, so the flex row and the stacked lines apply. */
    return [node("div", { className: "person" }, [badge, node("span", { className: "person-lines" }, line)])];
  }

  function studentStatus(item) {
    return item.account_status || item.effective_status || item.status || (item.account && (item.account.effective_status || item.account.status)) || "unknown";
  }

  function studentLicense(item) {
    const license = item.license || {};
    return item.license_status || license.status || (license.active ? "active" : "none");
  }

  function deviceSummary(item) {
    const devices = item.devices || {};
    const phone = devices.phone || item.phone_device;
    const computer = devices.computer || item.computer_device;
    /* 2026-08-30 — seats: the denominator is the admin-set allowed_devices */
    const limit = item.allowed_devices != null ? Number(item.allowed_devices) : 2;
    const used = (phone ? 1 : 0) + (computer ? 1 : 0);
    return `Devices ${used}/${limit}` + (phone ? " · Phone" : "") + (computer ? " · Computer" : "");
  }

  function detailButton(item, compact = false) {
    const id = item.id || item.user_id || item.student_id;
    return node("button", { className: compact ? "button" : "text-button", type: "button", text: t("dl.viewDetails", "View details"), dataset: { studentId: id } });
  }

  function renderStudents(body) {
    const students = normalizeList(body, ["students", "items", "data"]);
    state.studentTotal = count(body, "total", "count") || students.length;
    const rows = students.map(item => {
      const expiry = item.license_expires_at || item.expires_at || (item.license && item.license.expires_at);
      return node("tr", {}, [node("td", {}, person(item)), node("td", {}, statusPill(studentStatus(item))), node("td", {}, [statusPill(studentLicense(item)), node("small", { text: expiry ? ` ${formatDate(expiry, true)}` : "" })]), node("td", { text: deviceSummary(item) }), node("td", { text: formatDate(item.last_active_at) }), node("td", {}, detailButton(item))]);
    });
    const cards = students.map(item => node("article", { className: "student-card" }, [
      node("div", { className: "student-card-top" }, [node("div", {}, person(item)), statusPill(studentStatus(item))]),
      node("div", { className: "student-card-meta" }, [statusPill(studentLicense(item)), node("span", { className: "status-pill", text: deviceSummary(item) })]),
      detailButton(item, true),
    ]));
    $("#studentRows").replaceChildren(...rows);
    $("#studentCards").replaceChildren(...cards);
    $("#studentsEmpty").hidden = students.length > 0;
    $("#studentsPage").textContent = `${t("pg.page", "Page")} ${state.studentPage}`;
    $("#studentsPrev").disabled = state.studentPage <= 1;
    $("#studentsNext").disabled = state.studentPage * pageSize >= state.studentTotal;
  }

  function studentQuery() {
    const query = new URLSearchParams({ page: String(state.studentPage), limit: String(pageSize) });
    const search = $("#studentSearch").value.trim();
    const status = $("#studentStatus").value;
    const license = $("#studentLicense").value;
    if (search) query.set("q", search);
    if (status) query.set("status", status);
    if (license) query.set("license_status", license);
    return query;
  }

  async function loadStudents() {
    try { renderStudents(await api(`${API.students}?${studentQuery()}`)); }
    catch (error) { handleError(error, "Could not load students."); }
  }

  function historyQuery(studentId = "") {
    const query = new URLSearchParams({ page: String(state.historyPage), limit: String(pageSize) });
    const search = $("#historySearch").value.trim();
    const type = $("#historyType").value;
    if (search) query.set("search", search);
    query.set("type", type || "all");
    if ($("#historyFrom").value) query.set("from", $("#historyFrom").value);
    if ($("#historyTo").value) query.set("to", $("#historyTo").value);
    if (studentId) query.set("student_id", studentId);
    return query;
  }

  function eventName(item) {
    return item.action || item.event_type || item.type || "activity";
  }

  /* The audit trail's own vocabulary, translated where a word exists and
     left as the server said it otherwise — never a guess. */
  function eventLabel(item) {
    const raw = String(eventName(item)).toLowerCase();
    const NAMES = { login: "e.login", logout: "e.logout", refresh: "e.refresh",
      failed_login: "e.failedLogin", forced_logout: "e.forcedLogout",
      password_reset: "e.passwordReset",
      download: "e.download", activity: "e.activity" };
    return NAMES[raw] ? t(NAMES[raw], title(raw)) : title(raw);
  }

  /* 2026-08-31 — history rows stored the raw browser user-agent as the device
     name, so phones showed six lines of "Mozilla/5.0 (Linux; Android 10; K)…"
     per row. A stored label ("Android · Chrome") passes through untouched;
     only a raw user-agent string is condensed to platform · browser. */
  function prettyDevice(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    if (!/mozilla\/|applewebkit|gecko\/|khtml/i.test(s)) return s;
    const os = /android/i.test(s) ? "Android" : /iphone|ipad|ipod/i.test(s) ? "iOS" : /windows/i.test(s) ? "Windows" : /macintosh|mac os/i.test(s) ? "macOS" : /linux/i.test(s) ? "Linux" : "Device";
    const browser = /edg(e|a|ios)?\//i.test(s) ? "Edge" : /opr\/|opera/i.test(s) ? "Opera" : /firefox\/|fxios\//i.test(s) ? "Firefox" : /chrome\/|crios\//i.test(s) ? "Chrome" : /safari\//i.test(s) ? "Safari" : "Browser";
    return `${os} · ${browser}`;
  }

  /* Some events carry machine payloads ('{"slot_type":"phone"}') in their
     detail field. Admins read words, so JSON becomes "Slot type: phone";
     anything that does not parse stays as it was. */
  function prettyDetail(raw) {
    const s = String(raw || "").trim();
    if (!s || (s[0] !== "{" && s[0] !== "[")) return s;
    try {
      const value = JSON.parse(s);
      const parts = Object.entries(value).map(([key, val]) => `${title(String(key).replace(/_/g, " "))}: ${typeof val === "object" && val !== null ? JSON.stringify(val) : val}`);
      return parts.length ? parts.join(" · ") : s;
    } catch (_) { return s; }
  }

  function renderHistory(body) {
    const events = normalizeList(body, ["events", "history", "items", "data"]);
    state.historyTotal = count(body, "total", "count") || events.length;
    $("#historyRows").replaceChildren(...events.map(item => node("tr", {}, [
      node("td", { className: "cell-time", text: formatDate(item.created_at || item.time || item.login_at) }),
      node("td", {}, person(item)),
      node("td", {}, [node("b", { text: eventLabel(item) }), node("small", { text: prettyDetail(item.detail || item.message || "") })]),
      node("td", { text: prettyDevice(item.device_name || item.browser || item.app || item.channel) || "—" }),
      node("td", {}, statusPill(item.result || item.status || "success")),
    ])));
    /* 2026-09-01 — owner, live phone: the five-column audit table forced a
       sideways scroll and cut every row in half. Below 1000px the same rows
       render as cards instead, exactly like the student list. */
    $("#historyCards").replaceChildren(...events.map(item => node("article", { className: "history-card" }, [
      node("div", { className: "history-card-top" }, [
        node("b", { text: eventLabel(item) }),
        statusPill(item.result || item.status || "success")]),
      node("div", {}, person(item)),
      node("div", { className: "history-card-meta" }, [
        node("span", { text: formatDate(item.created_at || item.time || item.login_at) }),
        node("span", { text: prettyDevice(item.device_name || item.browser || item.app || item.channel) || "—" })]),
      prettyDetail(item.detail || item.message || "") ? node("small", { text: prettyDetail(item.detail || item.message) }) : null,
    ].filter(Boolean))));
    $("#historyEmpty").hidden = events.length > 0;
    $("#historyPage").textContent = `${t("pg.page", "Page")} ${state.historyPage}`;
    $("#historyPrev").disabled = state.historyPage <= 1;
    $("#historyNext").disabled = state.historyPage * pageSize >= state.historyTotal;
  }

  async function loadHistory() {
    try { renderHistory(await api(`${API.histories}?${historyQuery()}`)); }
    catch (error) { handleError(error, "Could not load activity history."); }
  }

  function detailRecord(body) {
    const student = body.student || body.user || body.profile || body;
    const flatLicense = {
      status: student.license_status,
      starts_at: student.license_starts_at || student.starts_at,
      expires_at: student.license_expires_at || student.expires_at,
      active: student.license_active,
    };
    const flatPermissions = {
      web_app: student.web_app_enabled,
      ccx_download: student.ccx_download_enabled,
      panel: student.panel_enabled,
      photoshop_panel: student.panel_enabled,
    };
    let devices = body.devices || student.devices || {};
    if (Array.isArray(devices)) {
      devices = devices.reduce((slots, slot) => {
        const key = slot.slot_type || slot.device_type || slot.type;
        if (key === "phone" || key === "computer") {
          const installations = Array.isArray(slot.installations) ? slot.installations.filter(item => item && !item.revoked_at) : [];
          slots[key] = installations[0] ? { ...slot, ...installations[0] } : (slot.status === "active" ? slot : null);
        }
        return slots;
      }, { phone: null, computer: null });
    }
    return {
      ...student,
      account: body.account || student.account || { status: student.account_status || student.status },
      license: body.license || student.license || flatLicense,
      permissions: body.permissions || student.permissions || flatPermissions,
      devices,
      history: body.history || body.events || student.history || [],
    };
  }

  function permissionValue(permissions, key) {
    if (key === "photoshop_panel") return Boolean(permissions.photoshop_panel ?? permissions.panel);
    return Boolean(permissions[key]);
  }

  function renderStudentDetail(body) {
    const item = detailRecord(body);
    state.selected = item;
    const name = item.name || item.full_name || item.email || "Student";
    $("#studentDialogTitle").textContent = name;
    $("#studentDialogEmail").textContent = item.email || "";
    /* v5.75.0 — the member's own photo in the detail, not only in the list.
       Same bound as person() applies: API text is accepted ONLY as a small
       base64 image data URL, and anything else falls back to the initial. */
    const detailPhoto = typeof item.avatar === "string" && item.avatar.length <= 98304 &&
      /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(item.avatar) ? item.avatar : "";
    const detailBadge = $("#studentDialogAvatar");
    if (detailBadge) {
      detailBadge.replaceChildren(detailPhoto
        ? node("img", { className: "avatar avatar-photo", src: detailPhoto, alt: "", "aria-hidden": "true" })
        : node("span", { className: "avatar", text: name.slice(0, 1).toUpperCase(), "aria-hidden": "true" }));
    }
    const account = item.account || {};
    const license = item.license || {};
    const stats = [
      [t("th.account", "Account"), title(account.effective_status || account.status || studentStatus(item))],
      [t("th.license", "License"), title(license.status || studentLicense(item))],
      [t("d.starts", "Starts"), formatDate(license.starts_at, true)],
      [t("d.expires", "Expires"), formatDate(license.expires_at || item.license_expires_at, true)],
      [t("d.lastLogin", "Last login"), formatDate(item.last_login_at)],
      [t("th.lastActive", "Last active"), formatDate(item.last_active_at)],
      [t("d.lastDownload", "Last download"), formatDate(item.last_download_at)],
      [t("th.devices", "Devices"), deviceSummary(item)],
    ];
    $("#studentSummary").replaceChildren(...stats.map(([label, value]) => node("div", { className: "detail-stat" }, [node("span", { text: label }), node("b", { text: value })])));

    const permissionLabels = [["web_app", t("p.webApp", "Student Web App")], ["ccx_download", t("p.ccx", "Panel download")], ["photoshop_panel", t("p.panel", "Photoshop Panel")]];
    $("#permissionToggles").replaceChildren(...permissionLabels.map(([key, label]) => {
      const control = node("input", { type: "checkbox", checked: permissionValue(item.permissions || {}, key), "aria-label": `${label} permission` });
      control.addEventListener("change", async () => {
        control.disabled = true;
        try {
          await runAction("set_permission", { permission: key, enabled: control.checked }, false);
          notify(`${label} permission updated.`);
        } catch (_) { control.checked = !control.checked; }
        finally { control.disabled = false; }
      });
      return node("label", { className: "toggle-row" }, [node("span", { text: label }), control]);
    }));

    const devices = item.devices || {};
    $("#studentDevices").replaceChildren(...[[t("d.phone", "Phone"), devices.phone], [t("d.computer", "Computer"), devices.computer]].map(([kind, device]) => node("div", { className: "device-row" }, [
      node("div", {}, [node("b", { text: `${kind} ${device ? "1/1" : "0/1"}` }), node("small", { text: device ? prettyDevice(device.label || device.device_name) || t("d.registered", "Registered") : t("d.notRegistered", "Not registered") })]),
      statusPill(device ? "active" : "empty"),
    ])));

    const canonicalAccountStatus = String(account.status || item.account_status || item.status || "pending").toLowerCase();
    const accountActions = [
      ...(canonicalAccountStatus === "pending" ? [["approve", t("act.approve", "Approve"), "primary"]] : []),
      ["reject", t("act.reject", "Reject"), "danger"], ["activate", t("act.activate", "Activate"), ""],
      ["suspend", t("act.suspend", "Suspend"), "danger"], ["ban", t("act.ban", "Ban"), "danger"],
    ];
    $("#accountActions").replaceChildren(...accountActions.map(([action, label, tone]) => actionButton(action, label, tone)));
    const securityActions = [
      ["reset_phone", t("act.resetPhone", "Reset Phone"), ""], ["reset_computer", t("act.resetComputer", "Reset Computer"), ""],
      ["force_logout", t("act.forceLogout", "Force logout"), "danger"], ["password_reset", t("act.reset", "Send password reset"), ""],
    ];
    $("#securityActions").replaceChildren(...securityActions.map(([action, label, tone]) => actionButton(action, label, tone)));
    const limitInput = $("#deviceLimit");
    if (limitInput) limitInput.value = item.allowed_devices != null ? String(item.allowed_devices) : "2";

    const events = normalizeList({ events: item.history }, ["events"]);
    $("#studentHistory").replaceChildren(...events.slice(0, 6).map(event => node("div", { className: "history-item" }, [node("time", { text: formatDate(event.created_at || event.time) }), node("b", { text: eventLabel(event) }), node("span", { text: prettyDetail(event.detail || event.message) || prettyDevice(event.device_name) || "—" })])));
    if (!events.length) $("#studentHistory").append(node("p", { className: "empty", text: t("dl.noHistory", "No recent history.") }));
  }

  function selectedId() {
    return state.selected && (state.selected.id || state.selected.user_id || state.selected.student_id);
  }

  function actionButton(action, label, tone) {
    const button = node("button", { type: "button", className: `button ${tone}`, text: label });
    button.addEventListener("click", () => confirmAndRun(action, label));
    return button;
  }

  function confirmAction(message, danger = false) {
    const dialog = $("#confirmDialog");
    $("#confirmMessage").textContent = message;
    $("#confirmAction").className = `button ${danger ? "danger" : "primary"}`;
    dialog.returnValue = "";
    dialog.showModal();
    $("#confirmAction").focus();
    return new Promise(resolve => {
      const done = () => { dialog.removeEventListener("close", done); resolve(dialog.returnValue === "confirm"); };
      dialog.addEventListener("close", done);
    });
  }

  async function confirmAndRun(action, label, extra = {}) {
    const approved = await confirmAction(`${label} for ${state.selected && (state.selected.email || state.selected.name || "this student")}? This operation is written to the admin audit history.`, ["reject", "suspend", "ban", "force_logout", "reset_phone", "reset_computer"].includes(action));
    if (!approved) return;
    await runAction(action, extra);
  }

  async function runAction(action, extra = {}, refresh = true) {
    const id = selectedId();
    if (!id) throw new Error("No student is selected.");
    const payload = { action, ...extra };
    const mutation = action === "extend_license"
      ? await mutationFor("extend_license", { student_id: id, ...payload }) : null;
    if (mutation) payload.mutation_id = mutation.id;
    let body;
    try {
      body = await api(`${API.students}/${encodeURIComponent(id)}/actions`, { method: "POST", body: JSON.stringify(payload) });
    } catch (error) { handleError(error, `${title(action)} failed.`); throw error; }
    notify(body.message || `${title(action)} completed.`);
    if (refresh) {
      try {
        await Promise.all([openStudent(id, false), loadStudents(), loadDashboard(false)]);
        if (mutation) clearMutation(mutation);
      }
      catch (error) {
        const summary = `${title(action)} completed, but refreshed data could not be loaded.`;
        const message = error && error.message ? `${summary} ${error.message}` : summary;
        handleError(Object.assign(new Error(message), {
          status: error && error.status,
          body: error && error.body,
        }), summary);
      }
    } else if (mutation) clearMutation(mutation);
    return body;
  }

  async function openStudent(id, open = true) {
    try {
      const body = await api(`${API.students}/${encodeURIComponent(id)}`);
      renderStudentDetail(body);
      const dialog = $("#studentDialog");
      if (open && !dialog.open) dialog.showModal();
      $("#closeStudentDialog").focus();
    } catch (error) { handleError(error, "Could not load student details."); }
  }

  async function loadPanelVersion() {
    try {
      const body = await api(API.panelVersion);
      const policy = body.panel || body;
      $("#latestVersion").value = policy.latest_version || policy.latest || "6.34.0";
      $("#minimumVersion").value = policy.minimum_supported_version || policy.minimum || "6.34.0";
      if (!$("#artifactVersion").value) $("#artifactVersion").value = $("#latestVersion").value;
      const resumable = readArtifactState();
      $("#checkArtifactResume").hidden = !(resumable && resumable.id);
      if (resumable && resumable.id) checkArtifactResume(false);
    } catch (error) { handleError(error, "Could not load the panel version policy."); }
  }

  function readArtifactState() {
    try { return JSON.parse(sessionStorage.getItem(ARTIFACT_STATE_KEY) || "null"); }
    catch (_) { return null; }
  }

  function saveArtifactState(value) {
    sessionStorage.setItem(ARTIFACT_STATE_KEY, JSON.stringify(value));
    $("#checkArtifactResume").hidden = !(value && value.id);
  }

  function clearArtifactState() {
    sessionStorage.removeItem(ARTIFACT_STATE_KEY);
    $("#checkArtifactResume").hidden = true;
  }

  function humanBytes(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
  }

  function setArtifactProgress(uploaded, total, message) {
    const percent = total > 0 ? Math.max(0, Math.min(100, Math.round(uploaded / total * 100))) : 0;
    $("#artifactProgress").value = percent;
    $("#artifactProgressText").textContent = message || `${percent}% · ${humanBytes(uploaded)} of ${humanBytes(total)}`;
  }

  function setArtifactStatus(message = "", ok = false) {
    setFormStatus("#artifactUploadStatus", message, ok);
  }

  async function sha256Hex(source) {
    if (!window.crypto || !window.crypto.subtle) throw new Error("Secure browser hashing is unavailable.");
    const buffer = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
    const digest = await window.crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function base64FromBuffer(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 32768)));
    }
    return btoa(binary);
  }

  function uploadedBytes(indices, size, chunkSize) {
    return [...indices].reduce((sum, index) => sum + Math.max(0, Math.min(chunkSize, size - index * chunkSize)), 0);
  }

  async function checkArtifactResume(announce = true) {
    const saved = readArtifactState();
    if (!saved || !saved.id) return setArtifactStatus("No resumable upload is recorded in this tab.");
    try {
      const body = await api(`${API.artifacts}/${encodeURIComponent(saved.id)}`);
      const artifact = body.artifact || {};
      const indices = new Set((artifact.uploaded_indices || []).map(Number));
      const bytes = Number(artifact.uploaded_size_bytes || uploadedBytes(indices, saved.size, saved.chunkSize || ARTIFACT_CHUNK_SIZE));
      setArtifactProgress(bytes, Number(saved.size), artifact.status === "ready" ? "Artifact verified · ready to enable" : `${indices.size} of ${artifact.chunk_count || saved.chunkCount || "?"} chunks uploaded`);
      $("#artifactHashText").textContent = saved.sha256 ? `SHA-256 ${saved.sha256.slice(0, 16)}…` : "";
      $("#artifactFileSummary").textContent = `${saved.name || "Panel package"} · ${humanBytes(saved.size)} · reselect the same file to resume`;
      if (announce) setArtifactStatus(artifact.status === "ready" ? "Private artifact is finalized. Reselect the file to enable its release policy." : "Resumable upload found. Reselect the same package, then continue.", true);
      return artifact;
    } catch (error) { handleError(error, "Could not read resumable artifact status."); return null; }
  }

  function selectedArtifactFile() {
    const file = $("#panelArtifactFile").files && $("#panelArtifactFile").files[0];
    if (!file) throw new Error("Choose a Panel package first.");
    if (!/\.[c][c][x]$/i.test(file.name)) throw new Error("Choose a valid Creative Cloud panel package.");
    if (!file.size || file.size > MAX_ARTIFACT_SIZE) throw new Error("Panel package size must be between 1 byte and 512 MiB.");
    return file;
  }

  async function finalizePanelArtifact(upload) {
    setArtifactStatus("All chunks uploaded. Verifying the complete private artifact…", true);
    const finalized = await api(`${API.artifacts}/${encodeURIComponent(upload.id)}/finalize`, { method:"POST", body:"{}" });
    setArtifactProgress(upload.size, upload.size, "Artifact integrity verified · enabling release");
    await api(API.panelVersion, { method:"PUT", body:JSON.stringify({
      latest_version:upload.version,
      minimum_supported_version:$("#minimumVersion").value || upload.version,
      enabled: true,
      sha256:upload.sha256,
      size_bytes:upload.size,
    }) });
    $("#latestVersion").value = upload.version;
    $("#artifactVersion").value = upload.version;
    clearArtifactState();
    setArtifactStatus(`Version ${upload.version} is finalized in private storage and enabled.`, true);
    notify(`Panel ${upload.version} verified and enabled.`);
    return finalized;
  }

  async function uploadPanelArtifact(event) {
    event.preventDefault();
    if (state.artifactBusy) return;
    let file;
    try { file = selectedArtifactFile(); }
    catch (error) { return setArtifactStatus(error.message); }
    const version = $("#artifactVersion").value.trim();
    if (!/^\d+\.\d+\.\d+$/.test(version)) return setArtifactStatus("Enter a valid semantic version.");
    state.artifactBusy = true; state.artifactFile = file;
    const button = $("#uploadPanelArtifact"); button.disabled = true;
    try {
      setArtifactProgress(0, file.size, "Computing complete SHA-256 in this tab…");
      setArtifactStatus("The package stays in memory while its integrity hash is computed.", true);
      const totalSha256 = await sha256Hex(file);
      $("#artifactHashText").textContent = `SHA-256 ${totalSha256.slice(0, 16)}…`;
      const initiated = await api(API.artifactInitiate, { method:"POST", body:JSON.stringify({
        version, sha256:totalSha256, size_bytes:file.size, chunk_size:ARTIFACT_CHUNK_SIZE,
      }) });
      const initialArtifact = initiated.artifact || {};
      const upload = { id:initialArtifact.id, version, sha256:totalSha256, size:file.size,
        name:file.name, chunkSize:Number(initialArtifact.chunk_size || ARTIFACT_CHUNK_SIZE),
        chunkCount:Number(initialArtifact.chunk_count || Math.ceil(file.size / ARTIFACT_CHUNK_SIZE)) };
      if (!upload.id) throw new Error("The server did not create a private upload.");
      saveArtifactState(upload);
      const statusBody = await api(`${API.artifacts}/${encodeURIComponent(upload.id)}`);
      const status = statusBody.artifact || initialArtifact;
      const uploaded = new Set((status.uploaded_indices || []).map(Number));
      setArtifactProgress(uploadedBytes(uploaded, upload.size, upload.chunkSize), upload.size,
        status.status === "ready" ? "Artifact already verified · enabling release" : `Resuming after ${uploaded.size} verified chunks`);
      if (status.status !== "ready") {
        for (let index = 0; index < upload.chunkCount; index++) {
          if (uploaded.has(index)) continue;
          const start = index * upload.chunkSize, end = Math.min(file.size, start + upload.chunkSize);
          const buffer = await file.slice(start, end).arrayBuffer();
          const chunkSha256 = await sha256Hex(buffer);
          await api(`${API.artifacts}/${encodeURIComponent(upload.id)}/chunks/${index}`, { method:"PUT", body:JSON.stringify({
            data_base64:base64FromBuffer(buffer), sha256:chunkSha256,
          }) });
          uploaded.add(index);
          setArtifactProgress(uploadedBytes(uploaded, upload.size, upload.chunkSize), upload.size,
            `Uploaded verified chunk ${uploaded.size} of ${upload.chunkCount}`);
        }
      }
      await finalizePanelArtifact(upload);
    } catch (error) {
      setArtifactStatus(`${error.message || "Artifact upload failed."}\nReselect the same package to resume verified chunks.`);
      if (error.status === 401 || error.status === 403) handleError(error, "Artifact upload was not authorized.");
    } finally { state.artifactBusy = false; state.artifactFile = null; button.disabled = false; }
  }

  async function submitAdminLogin(event) {
    event.preventDefault();
    const email = $("#adminLoginEmail").value.trim();
    const password = $("#adminLoginPassword").value;
    if (!email || password.length < 6) return setFormStatus("#adminLoginStatus", "Enter the administrator email and password.");
    const button = $("#adminLoginButton"); button.disabled = true;
    setFormStatus("#adminLoginStatus", "Signing in…", true);
    try {
      await adminPasswordLogin(email, password);
      $("#adminLoginPassword").value = "";
      await bootstrap();
    } catch (error) {
      clearSession();
      setFormStatus("#adminLoginStatus", error.message || "Administrator sign-in failed.");
      $("#adminLoginPassword").select();
    } finally { button.disabled = false; }
  }

  function handleError(error, fallback) {
    if (error.status === 401) { clearSession(); showLogin("Your secure admin session expired. Sign in again to continue."); return; }
    if (error.status === 403) { showForbidden("Not authorized: the server rejected this session's administrator role."); return; }
    notify(error.message || fallback, "error");
  }

  async function loadDashboard(reveal = true) {
    const body = await api(API.dashboard);
    if (reveal) showApp(body);
    renderDashboard(body);
    loadVisits().catch(() => {});
    return body;
  }

  /* v5.61.0 — the landing's privacy-light visit counters. The card stays
     hidden unless the server answers, so an older API never shows a broken
     panel; the data is only (day, page, hits) — there is nothing else. */
  const ROOM_NAMES = Object.freeze({
    landing: "Landing page", "room:pgWf": "Workflows", "room:pgLib": "Library",
    "room:pgMeitu": "Retouch A", "room:pgEvoto": "Retouch B", "room:pgRetouch": "Retouch",
    "room:pgEdit": "Freeform", "room:pgVideo": "Media Lab", "room:pgUpscale": "Upscale",
    "room:pgBatch": "Batch", "room:pgGallery": "Gallery",
  });
  async function loadVisits() {
    const card = $("#visitsCard");
    if (!card) return;
    const body = await api(API.visits);
    const days = Array.isArray(body.days) ? body.days : [];
    const pages = Array.isArray(body.pages) ? body.pages : [];
    const today = days.length ? Number(days[0].hits) : 0;
    const summary = [
      [t("v.total30", "Last 30 days"), Number(body.total_30d || 0)],
      [t("v.latestDay", "Latest day"), today],
    ];
    $("#visitsSummary").replaceChildren(...summary.map(([label, value]) =>
      node("div", { className: "attention-row" }, [node("span", { text: label }), node("b", { text: String(value) })])));
    $("#visitsPages").replaceChildren(...pages.slice(0, 8).map(row =>
      node("div", { className: "attention-row" }, [
        node("span", { text: ROOM_NAMES[row.page] || row.page }), node("b", { text: String(row.hits) })])));
    paintChart("#visitsChart", days, { tone: "blue", label: t("ch.visits", "Visits per day") });
    $("#visitsEmpty").hidden = pages.length > 0;
    card.hidden = false;
  }

  const deviceLimitSave = $("#deviceLimitSave");
  if (deviceLimitSave) deviceLimitSave.addEventListener("click", async () => {
    const n = Number(($("#deviceLimit") || {}).value);
    if (!Number.isInteger(n) || n < 1 || n > 20) { notify(t("msg.deviceRange", "Devices must be 1-20"), "error"); return; }
    await runAction("set_devices", { allowed_devices: n });
  });

  function activatePanel(name) {
    try { localStorage.setItem(PANEL_KEY, name); } catch (_) {}
    $$(".panel").forEach(panel => panel.classList.toggle("active", panel.id === `panel-${name}`));
    $$(".nav-item").forEach(button => {
      const active = button.dataset.panel === name;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
    const titles = { overview: ["nav.overview", "Overview"], students: ["nav.students", "Students"],
      history: ["nav.history", "Activity history"], security: ["nav.security", "Security & Panel"] };
    const pair = titles[name];
    $("#pageTitle").textContent = pair ? t(pair[0], pair[1]) : title(name);
    $(".sidebar").classList.remove("open");
    $("#menuButton").setAttribute("aria-expanded", "false");
    if (name === "students") loadStudents();
    if (name === "history") loadHistory();
    if (name === "security") loadPanelVersion();
    if (name === "overview") loadDashboard(false).catch(error => handleError(error, "Could not refresh the dashboard."));
    $("#main").focus({ preventScroll: true });
  }

  function bind() {
    $("#adminLoginForm").addEventListener("submit", submitAdminLogin);
    $("#clearAdmin").addEventListener("click", () => signOutAdmin("Sign in with another administrator account."));
    $("#adminSignOut").addEventListener("click", () => signOutAdmin());
    $$("[data-panel]").forEach(button => button.addEventListener("click", () => activatePanel(button.dataset.panel)));
    $$("[data-go]").forEach(button => button.addEventListener("click", () => {
      activatePanel(button.dataset.go);
      if (button.dataset.filterStatus) { $("#studentStatus").value = button.dataset.filterStatus; state.studentPage = 1; loadStudents(); }
    }));
    $("#menuButton").addEventListener("click", () => {
      const open = $(".sidebar").classList.toggle("open");
      $("#menuButton").setAttribute("aria-expanded", String(open));
    });
    $("#refreshAll").addEventListener("click", () => activatePanel($(".nav-item.active").dataset.panel));
    $("#langToggle").addEventListener("click", () => {
      LANG = LANG === "my" ? "en" : "my";
      try { localStorage.setItem(LANG_KEY, LANG); } catch (_) { }
      applyI18n();
      /* re-render whatever is on screen so dynamic text follows the switch */
      const active = $(".nav-item.active");
      if (active) activatePanel(active.dataset.panel);
    });
    $("#alertBell").addEventListener("click", () => {
      activatePanel("students");
      const select = $("#studentStatus");
      if (select) { select.value = "pending"; state.studentPage = 1; loadStudents(); }
    });
    $("#retryAdmin").addEventListener("click", bootstrap);
    $("#reloadStudents").addEventListener("click", loadStudents);
    $("#studentFilters").addEventListener("submit", event => { event.preventDefault(); state.studentPage = 1; loadStudents(); });
    $("#studentsPrev").addEventListener("click", () => { if (state.studentPage > 1) { state.studentPage--; loadStudents(); } });
    $("#studentsNext").addEventListener("click", () => { state.studentPage++; loadStudents(); });
    $("#studentRows").addEventListener("click", event => { const button = event.target.closest("[data-student-id]"); if (button) openStudent(button.dataset.studentId); });
    $("#studentCards").addEventListener("click", event => { const button = event.target.closest("[data-student-id]"); if (button) openStudent(button.dataset.studentId); });
    $("#closeStudentDialog").addEventListener("click", () => $("#studentDialog").close());
    $("#reloadHistory").addEventListener("click", loadHistory);
    $("#historyFilters").addEventListener("submit", event => { event.preventDefault(); state.historyPage = 1; loadHistory(); });
    $("#historyPrev").addEventListener("click", () => { if (state.historyPage > 1) { state.historyPage--; loadHistory(); } });
    $("#historyNext").addEventListener("click", () => { state.historyPage++; loadHistory(); });
    $("#viewStudentHistory").addEventListener("click", () => {
      $("#studentDialog").close(); activatePanel("history"); $("#historySearch").value = state.selected && (state.selected.email || state.selected.name) || ""; state.historyPage = 1; loadHistory();
    });
    $("#extendLicense").addEventListener("click", () => confirmAndRun("extend_license", "Extend license", { months: Number($("#licenseMonths").value) }));
    $("#setExpiry").addEventListener("click", () => {
      const value = $("#customExpiry").value;
      if (!value) return notify(t("msg.pickExpiry", "Choose a custom expiry date first."), "error");
      confirmAndRun("set_expiry", "Set custom expiry", { expires_at: new Date(`${value}T23:59:59Z`).toISOString() });
    });
    $("#panelArtifactForm").addEventListener("submit", uploadPanelArtifact);
    $("#panelArtifactFile").addEventListener("change", () => {
      try {
        const file = selectedArtifactFile(); state.artifactFile = file;
        $("#artifactFileSummary").textContent = `${file.name} · ${humanBytes(file.size)} · held only in this tab's memory`;
        setArtifactProgress(0, file.size, "Ready to compute integrity hash"); setArtifactStatus("");
      } catch (error) { state.artifactFile = null; setArtifactStatus(error.message); }
    });
    $("#checkArtifactResume").addEventListener("click", () => checkArtifactResume(true));
    $("#panelVersionForm").addEventListener("submit", async event => {
      event.preventDefault();
      try {
        await api(API.panelVersion, { method: "PUT", body: JSON.stringify({ latest_version: $("#latestVersion").value, minimum_supported_version: $("#minimumVersion").value }) });
        notify(t("msg.versionSaved", "Panel version policy saved."));
      } catch (error) { handleError(error, "Could not save panel version policy."); }
    });
  }

  async function bootstrap() {
    applyI18n();
    hideAuthSurfaces();
    $("#adminChecking").hidden = false;
    if (!accessToken()) return showLogin();
    try {
      await loadDashboard(true);
      await Promise.all([loadStudents(), loadHistory(), loadPanelVersion()]);
      /* reopen on the panel the administrator left, per the owner */
      const remembered = (() => { try { return localStorage.getItem(PANEL_KEY) || ""; } catch (_) { return ""; } })();
      if (remembered && remembered !== "overview" && $(`#panel-${remembered}`)) activatePanel(remembered);
    } catch (error) { handleError(error, "Could not verify administrator access."); }
  }

  /* 2026-08-31 — the hero band's cinemagraph: same contract as the web app
     heroes (decoder-picked mp4/webm pair, fade in only once playing, remove
     on error, never under prefers-reduced-motion). Same-origin asset, so the
     page's strict connect/media policy is untouched. */
  function heroMotion() {
    try {
      if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const hero = $(".admin-hero");
      if (!hero) return;
      const clip = document.createElement("video");
      clip.muted = true; clip.loop = true; clip.playsInline = true;
      clip.setAttribute("muted", ""); clip.setAttribute("playsinline", "");
      clip.setAttribute("aria-hidden", "true"); clip.tabIndex = -1;
      const ext = clip.canPlayType('video/mp4; codecs="avc1.42E01E"') ? ".mp4"
        : (clip.canPlayType('video/webm; codecs="vp9"') ? ".webm" : "");
      if (!ext) return;
      clip.src = `../app/lib/banners/motion/banner-superhero${ext}`;
      clip.addEventListener("playing", () => clip.classList.add("live"));
      clip.addEventListener("error", () => clip.remove());
      hero.append(clip);
      const started = clip.play();
      if (started && started.catch) started.catch(() => {});
    } catch (_) {}
  }

  bind();
  heroMotion();
  bootstrap();
})();
