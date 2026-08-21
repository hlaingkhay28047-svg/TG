/* v5.31.0 landing-honesty sweep — the public page no longer promises a free
   app that has been behind a paywall since v5.30.0.

   WHAT WAS WRONG. v5.30.0 put an account + Premium wall around the entire web
   app. The landing site was not touched, so for two releases it went on
   telling every visitor the Studio was free — in 23 Burmese places, in the
   English copy, in the three social/meta descriptions a link preview shows,
   and in the JSON-LD, which stated `"offers":{"price":"0"}` outright. A
   visitor read "Try Web Studio — free · no install", tapped it, and landed on
   a login wall demanding a paid plan. That is the worst possible first
   impression and it was live on the production domain.

   WHAT WAS DELIBERATELY LEFT ALONE, and this is the whole reason the fix is
   narrow. "Free" appears on this page for TWO different reasons:

     - about HNK ......... "Web Studio is free", "HNK charges no subscription".
                           FALSE since v5.30.0. Removed.
     - about GOOGLE ...... "a Gemini key is free at aistudio.google.com",
                           "the daily free quota is enough to try it".
                           STILL TRUE. Untouched.

   Deleting the second group would have been the easy over-correction and it
   would have made the page wrong in the other direction: the AI engines really
   are bring-your-own-key, and Gemini's free tier really does exist. The two
   costs are separate and the page now says so.

   HOW THE COPY WAS CHANGED, given 27 locales. Nothing was invented:

     - The four short strings (hero.cta1, s4.cta, duo1.li1, faq1.a) had the
       word for "free" DELETED along with one adjacent separator. Deletion
       needs no new translation, so all 27 locales are as trustworthy as they
       were before.
     - key.body's opening clause is the one that needed new words, because
       "HNK charges no subscription" cannot be fixed by deleting anything — its
       replacement has to say the opposite. For shn/kac/khb/kht/tdd the new
       clause is built ONLY from vocabulary already shipped and reviewed inside
       the app: gate_p's "needs Premium", the wall's "HNK Web Studio needs an
       account", and the conjunctions attested in the app's own strings
       (Shan လႄႈ and Kachin hte, both used as "and" in the shipped
       COST & BALANCE heading). No Tai-family sentence here was composed from
       scratch.

   WHAT IS STILL NOT CLAIMED, on purpose. The page states that a plan is
   required and does NOT state a price, because the price is not the page's to
   know: accLoadSettings reads it from Supabase app_settings at runtime, so any
   number hardcoded here could contradict what the customer is actually
   charged. Silence about the amount is correct; the earlier "0" was not.

   Pinned contracts:
   A) No HNK-is-free claim survives anywhere on the page, in any locale — the
      Burmese အခမဲ့, the English free/no-subscription forms, and each of the
      25 other locales' own word, checked in the four strings that carried it.
   B) The Gemini free-tier claims DO survive. This is the half that fails if
      someone "fixes" this by deleting every occurrence of the word.
   C) The three meta/social descriptions carry no free claim — these are what a
      Messenger/Telegram/Viber preview card shows, so a stale one keeps
      advertising the wrong thing long after the page is fixed.
   D) The JSON-LD WebApplication has no price:"0" Offer.
   E) key.body opens by stating the requirement in all 27 locales, and still
      explains the bring-your-own-key engines afterwards.
   F) The landing page and the app agree on the version.

   Usage: node test/sweep_v5310_landing_honesty.js  (no server needed) */
const fs = require("fs");
const path = require("path");
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const ROOT = path.join(__dirname, "..");
const landing = fs.readFileSync(path.join(ROOT, "docs", "index.html"), "utf8");
const app = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");

/* Carve the two i18n stores the landing page keeps: I18N holds the nine core
   languages, SITE_L the native packs for the rest. */
function carve(src, name) {
  const i = src.indexOf("var " + name);
  const j = src.indexOf("{", i);
  let d = 0, k = j;
  for (;;) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (d === 0) break; }
    k++;
  }
  return src.slice(j, k + 1);
}
const I18N = JSON.parse(carve(landing, "I18N"));
const siteL = carve(landing, "SITE_L");

function localeValue(key, lg) {
  if (I18N[key] && I18N[key][lg] !== undefined) return I18N[key][lg];
  const re = new RegExp('"' + key.replace(".", "\\.") + '":"((?:[^"\\\\]|\\\\.)*)"', "g");
  let m, out = [];
  while ((m = re.exec(siteL))) out.push(m[1]);
  return out;
}

/* The word each locale uses for "free". Listed rather than pattern-matched on
   purpose: a regex for "free" cannot tell Google's free tier from HNK's, and
   telling those apart is the entire point of this file. */
const FREE = {
  my: "အခမဲ့", en: "free", shn: "ဢမ်ႇသဵင်ႈငိုၼ်း", kac: "manu n ra ai", th: "ฟรี",
  zh: "免费", vi: "miễn phí", id: "gratis", ms: "percuma", bn: "ফ্রি", gu: "મફત",
  hi: "मुफ़्त", ja: "無料", khb: "ᦢᧁᧈᦵᦉᧂᧉᦇᦹᧃ", kht: "ဢမ်ႇꩬဵင်ႈငိုꩫ်း", km: "ឥតគិតថ្លៃ",
  kn: "ಉಚಿತ", ko: "무료", lo: "ຟຣີ", ml: "സൗജന്യം", mr: "मोफत", ne: "निःशुल्क",
  pa: "ਮੁਫ਼ਤ", ta: "இலவசம்", tdd: "ᥟᥛᥱᥔᥥᥒᥲᥒᥪᥢᥰ", te: "ఉచితం", ur: "مفت",
};

/* ---- A) the four strings that advertised the app itself ---- */
const CLEANED = ["hero.cta1", "s4.cta", "duo1.li1", "faq1.a"];
const dirty = [];
for (const key of CLEANED) {
  /* the nine core languages, each checked against its own word */
  for (const [lg, word] of Object.entries(FREE)) {
    const v = I18N[key] && I18N[key][lg];
    if (typeof v === "string" && v.includes(word)) dirty.push({ key, lg, value: v.slice(0, 80) });
  }
  /* and every native-pack copy of the same key */
  const re = new RegExp('"' + key.replace(".", "\\.") + '":"((?:[^"\\\\]|\\\\.)*)"', "g");
  let m;
  while ((m = re.exec(siteL))) {
    const v = m[1];
    for (const word of Object.values(FREE)) {
      if (v.includes(word)) { dirty.push({ key, where: "SITE_L", value: v.slice(0, 80) }); break; }
    }
  }
}
report("A) no locale still calls the Web Studio itself free", dirty.length === 0, dirty.slice(0, 6));

/* ---- B) the no-over-correction half ----
   Gemini's free tier is a fact about Google, not about HNK. If a later change
   strips every "free" on the page these three go quiet and this fails. */
const GEMINI_KEYS = ["step.4", "e1.desc", "faq3.a"];
const lostTruth = GEMINI_KEYS.filter(k => {
  const en = I18N[k] && I18N[k].en;
  const my = I18N[k] && I18N[k].my;
  return !(typeof en === "string" && /free/i.test(en)) || !(typeof my === "string" && my.includes("အခမဲ့"));
});
report("B) the Gemini free-tier facts are still stated (over-correction check)",
  lostTruth.length === 0, { lost: lostTruth });

/* ---- C) the link-preview cards ---- */
const metas = {};
for (const tag of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
  const m = landing.match(new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ' content="([^"]*)"'));
  metas[tag] = m ? m[1] : null;
}
const metaDirty = Object.entries(metas).filter(([, v]) =>
  v === null || v.includes("အခမဲ့") || /\bfree\b/i.test(v));
report("C) no meta/social description advertises a free app",
  metaDirty.length === 0, metaDirty.map(([t, v]) => ({ tag: t, value: (v || "").slice(0, 90) })));

/* ---- D) structured data ---- */
const ld = landing.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
let webApp = null, ldOk = false;
try {
  const graph = JSON.parse(ld[1])["@graph"] || [];
  webApp = graph.find(x => x["@type"] === "WebApplication") || null;
  ldOk = true;
} catch (e) {}
report("D) the JSON-LD parses and no longer offers the app at price 0",
  ldOk && webApp && webApp.offers === undefined,
  { parsed: ldOk, offers: webApp && webApp.offers });

/* ---- E) the requirement is actually stated, in every locale ---- */
const missing = [];
for (const lg of Object.keys(FREE)) {
  const v = I18N["key.body"] && I18N["key.body"][lg];
  if (typeof v === "string" && !/HNK Web Studio/.test(v)) missing.push({ lg, head: v.slice(0, 60) });
}
let slBodies = 0, slNamed = 0;
{
  const re = /"key\.body":"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(siteL))) { slBodies++; if (/HNK Web Studio/.test(m[1])) slNamed++; }
}
report("E) key.body names the product and its requirement in every locale",
  missing.length === 0 && slBodies > 0 && slNamed === slBodies,
  { coreMissing: missing, nativePacks: slBodies, named: slNamed });

/* the bring-your-own-key half must survive too — the point is two separate
   costs, not that the engines became included */
const byok = I18N["key.body"] && I18N["key.body"].en;
report("E2) key.body still explains the bring-your-own-key engines",
  typeof byok === "string" && /your own key/i.test(byok) && /Gemini/.test(byok),
  { head: (byok || "").slice(0, 120) });

/* ---- F ---- */
const appVer = (app.match(/var APP_VER\s*=\s*"([\d.]+)"/) || [])[1];
const advertised = [...landing.matchAll(/\b(?:Web Studio|WEB STUDIO)\s+v(\d+\.\d+\.\d+)/g)].map(m => m[1]);
report("F) landing and app agree on the shipped version",
  !!appVer && advertised.length > 0 && advertised.every(v => v === appVer) &&
  webApp && webApp.softwareVersion === appVer,
  { app: appVer, advertised: [...new Set(advertised)], schema: webApp && webApp.softwareVersion });

console.log("      (on the v5.30.1 tree this file reports 4 failures: A finds the free claim " +
  "in all 27 locales of hero.cta1/s4.cta/duo1.li1/faq1.a, C finds it in all three social " +
  "descriptions, D finds the price-0 Offer, and E finds key.body still opening with " +
  "\"HNK charges no subscription\")");

console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
process.exit(failures === 0 ? 0 : 1);
