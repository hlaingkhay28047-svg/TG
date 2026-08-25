/* Release contract for the HNK web app and its delivery toolchain.

   This check intentionally avoids third-party packages so it can run before
   Playwright is installed in CI. It protects the pieces that must move
   together on every release: app version, service-worker cache, supported
   Node runtime, GitHub Actions, and the two distinct DigitalOcean source
   modes. */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(ROOT, relative), "utf8");
const failures = [];

function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` :: ${detail}`}`);
  if (!ok) failures.push(label);
}

function versionAtLeast(actual, minimum) {
  const parse = value => String(value).split(".").map(Number);
  const a = parse(actual);
  const b = parse(minimum);
  if (a.length !== 3 || a.some(Number.isNaN)) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

const html = read("docs/app/index.html");
const sw = read("docs/app/sw.js");
const versionJson = JSON.parse(read("docs/app/version.json"));
const workflow = read(".github/workflows/test.yml");
const appSpec = read(".do/app.yaml");
const deployTemplate = read(".do/deploy.template.yaml");
const readme = read("README.md");
const landing = read("docs/index.html");
const robots = read("docs/robots.txt");
const sitemap = read("docs/sitemap.xml");
const apiServer = read("server/index.js");
const productionDeploy = read(".github/workflows/deploy-digitalocean.yml");
const stagingDeploy = read(".github/workflows/deploy-digitalocean-staging.yml");
const panelVersion = JSON.parse(read("docs/download/panel-version.json")).v;
const releaseDate = versionJson.released;
const englishProviderFlow = "Keys are stored locally and sent only to the AI provider you choose — never through HNK servers.";
const productionBase = "https://hnk-ai-tools-3-s4nnu.ondigitalocean.app";

function collectPublishedTextFiles(dir, out = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectPublishedTextFiles(full, out);
    else if (/\.(?:html?|js|mjs|json|xml|txt|md|css)$/i.test(entry.name)) out.push(full);
  });
  return out;
}
const publishedCcxReferences = collectPublishedTextFiles(path.join(ROOT, "docs")).flatMap(file => {
  const source = fs.readFileSync(file, "utf8");
  return [...source.matchAll(/[^\s"'<>]*\.ccx(?:[?#][^\s"'<>]*)?/gi)].map(match => ({
    file: path.relative(ROOT, file).replace(/\\/g, "/"), value: match[0]
  }));
});

const appVersion = (html.match(/var APP_VER\s*=\s*"([\d.]+)"/) || [])[1] || "";
const apiVersion = (apiServer.match(/const API_VERSION\s*=\s*"([\d.]+)"/) || [])[1] || "";
const cacheVersion = (sw.match(/var CACHE\s*=\s*"hnk-web-studio-v(\d+)-(\d+)-(\d+)"/) || []).slice(1).join(".");
const checkoutSha = (workflow.match(/actions\/checkout@([0-9a-f]{40})/) || [])[1] || "";
const setupNodeSha = (workflow.match(/actions\/setup-node@([0-9a-f]{40})/) || [])[1] || "";
const nodeMajor = Number((workflow.match(/node-version:\s*["']?(\d+)/) || [])[1]);
const advertisedWebVersions = [...landing.matchAll(/\b(?:Web Studio|WEB STUDIO)\s+v(\d+\.\d+\.\d+)/g)].map(match => match[1]);
const jsonLdText = (landing.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1] || "{}";
const jsonLd = JSON.parse(jsonLdText);
const webAppSchema = (jsonLd["@graph"] || []).find(item => item["@type"] === "WebApplication") || {};
const panelSchema = (jsonLd["@graph"] || []).find(item => item["@type"] === "SoftwareApplication") || {};
const localeStart = landing.indexOf("var I18N =");
const localeEnd = landing.indexOf("var sel=", localeStart);
const localeContext = {};
const localeSource = landing.slice(localeStart, localeEnd).replace(/\(function\(\)\{\s*/, "");
vm.runInNewContext(localeSource, localeContext);
const languageCodes = Array.from(localeContext.LANGS || []);
function effectiveLocaleValue(key, language) {
  const record = localeContext.I18N[key];
  if (record && record[language] != null) return record[language];
  const native = localeContext.SITE_L[language];
  if (native && native[key] != null) return native[key];
  const fallback = localeContext.SITE_FB[language];
  if (record && fallback && record[fallback] != null) return record[fallback];
  return record ? record[localeContext.DEF] : "";
}
const languageClaims = languageCodes.map(language => effectiveLocaleValue("duo1.li4", language));
const privacyClaims = languageCodes.map(language => effectiveLocaleValue("key.body", language));
const dateClaims = languageCodes.map(language => effectiveLocaleValue("badge.updated", language));
const panelAcquisitionKeys = ["hero.cta2", "s5.dl", "step.1", "s5.dlacct"];
const panelAcquisitionClaims = languageCodes.flatMap(language =>
  panelAcquisitionKeys.map(key => ({ language, key, value: effectiveLocaleValue(key, language) })));
const panelOverlayCodes = Object.keys(localeContext.PANEL_ACQ_L || {}).sort();
const expectedPanelOverlayCodes = Object.keys(localeContext.SITE_L || {}).sort();

const appLocaleStart = html.indexOf('var LANG = "my";');
const appLocaleEnd = html.indexOf("function L9(o){", appLocaleStart);
const appLocaleContext = { localStorage: { getItem() { return null; } } };
vm.runInNewContext(html.slice(appLocaleStart, appLocaleEnd), appLocaleContext);
function effectiveAppLocaleValue(key, language) {
  const native = appLocaleContext.TR_L[language];
  if (native && native[key] != null) return native[key];
  const record = appLocaleContext.TR[key];
  if (record && record[language] != null) return record[language];
  const fallback = appLocaleContext.LANG_FB[language];
  if (record && fallback && record[fallback] != null) return record[fallback];
  return record && record.en != null ? record.en : record.my;
}
const appPrivacyClaims = languageCodes.map(language => effectiveAppLocaleValue("key_note", language));
const landingNativePrivacyCodes = ["my", "shn", "kac", "th", "zh", "vi", "id", "ms", "hi", "bn", "ta", "te"];
const appNativePrivacyCodes = ["my", "shn", "kac", "th", "zh", "vi", "id", "ms", "hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "ur", "ne", "lo", "km", "ja", "ko"];
function hasProviderOnlyFlow(value) {
  return /\bAI\b/u.test(value) && /HNK/u.test(value) && !/never sent to any server/i.test(value);
}

const panelArtifact = path.join(ROOT, "docs", "download", `HNK_Ai_Panel_v${panelVersion}.ccx`);
let panelArtifactDetail = "missing or invalid archive";
let panelArtifactOk = false;
try {
  execFileSync("unzip", ["-tqq", panelArtifact], { stdio: "pipe" });
  const panelManifest = JSON.parse(execFileSync("unzip", ["-p", panelArtifact, "manifest.json"], { encoding: "utf8" }));
  panelArtifactDetail = `manifest ${panelManifest.version || "missing"}`;
  panelArtifactOk = panelManifest.version === panelVersion;
} catch (error) {
  panelArtifactDetail = error.message;
}

/* v6.22.0 — this check used to stop at the manifest, and the manifest was the
   one file inside the .ccx that was right. main.js carried
   `const PANEL_VERSION = "6.19.0"` while the manifest, panel-version.json and
   the download filename all said 6.21.0, so the panel's own update probe
   compared 6.19.0 against the published 6.21.0 and told every customer holding
   the NEWEST build, on every single launch, that an update was waiting. And
   the probe pointed at hlaingkhay28047-svg.github.io/TG — the GitHub Pages
   host this project retired — which the check below has forbidden in the
   landing page, robots.txt and the sitemap since the DigitalOcean move. It
   never looked inside the .ccx. Both defects shipped. */
let panelInternals = { version: "", updateUrl: "", brandVer: "", err: "" };
try {
  const panelMain = execFileSync("unzip", ["-p", panelArtifact, "main.js"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const panelIndex = execFileSync("unzip", ["-p", panelArtifact, "index.html"],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  panelInternals = {
    version: (panelMain.match(/const PANEL_VERSION\s*=\s*"([^"]+)"/) || [])[1] || "",
    updateUrl: (panelMain.match(/const PANEL_VERSION_URL\s*=\s*"([^"]+)"/) || [])[1] || "",
    brandVer: (panelIndex.match(/id="brandVer">v([0-9.]+)</) || [])[1] || "",
    retiredHostHits: (panelMain + panelIndex).split("hlaingkhay28047-svg.github.io").length - 1,
    err: ""
  };
} catch (error) { panelInternals.err = error.message; }

check("the app release is at least 5.2.0", versionAtLeast(appVersion, "5.2.0"), appVersion || "missing APP_VER");
check("APP_VER and version.json stay in lockstep", appVersion === versionJson.v, `${appVersion} vs ${versionJson.v}`);
check("the API identifies the same patch release as the web app", apiVersion === appVersion, `${apiVersion} vs ${appVersion}`);
check("the service-worker shell cache follows the app release", cacheVersion === appVersion, `${cacheVersion} vs ${appVersion}`);
check("both deploy lanes attest API version and the exact applied schema",
  [productionDeploy, stagingDeploy].every(source =>
    source.includes("/api/health") && source.includes("sha256sum server/sql/schema.sql") &&
    source.includes(".apiVersion // empty") && source.includes(".schemaFingerprint // empty") &&
    source.includes('ACTUAL_TLS" = "verified"')),
  "production or staging can succeed without runtime schema attestation");
check("every landing-page web-app badge advertises the shipped release", advertisedWebVersions.length > 0 && advertisedWebVersions.every(version => version === appVersion) && webAppSchema.softwareVersion === appVersion, `${[...new Set(advertisedWebVersions)].join(", ")} vs ${appVersion}`);
check("the landing page advertises every supported language", languageCodes.length === 37 && languageClaims.length >= 37 && languageClaims.every(value => /\b(?:37|၃၇)\b/.test(value)) && JSON.stringify(webAppSchema.inLanguage) === JSON.stringify(languageCodes), `${languageCodes.length} codes, ${languageClaims.length} claims`);
check("localized API-key copy describes the actual provider-only data flow", privacyClaims.length === languageCodes.length && privacyClaims.every(hasProviderOnlyFlow), `${privacyClaims.length} localized claims`);
check("fully translated landing locales do not fall back to an English privacy tail", landingNativePrivacyCodes.every(language => !effectiveLocaleValue("key.body", language).includes(englishProviderFlow)), "an English-only disclosure leaked into localized copy");
check("the web app describes the same provider-only API-key flow in every locale", appPrivacyClaims.length === languageCodes.length && appPrivacyClaims.every(hasProviderOnlyFlow), `${appPrivacyClaims.length} localized app notices`);
check("fully translated app locales do not fall back to an English privacy note", appNativePrivacyCodes.every(language => !effectiveAppLocaleValue("key_note", language).includes(englishProviderFlow)), "an English-only notice leaked into localized copy");
check("provider credentials route directly to the documented upstream APIs", /var API_BASE\s*=\s*"https:\/\/generativelanguage\.googleapis\.com\/v1beta"/.test(html) && /var RH_BASE\s*=\s*"https:\/\/www\.runninghub\.ai"/.test(html) && /var OA_BASE\s*=\s*"https:\/\/api\.openai\.com\/v1"/.test(html), "Gemini, RunningHub, or OpenAI base URL drifted");
check("the landing page carries the current release date in every locale", dateClaims.length >= 35 && dateClaims.every(value => value.includes(releaseDate)) && !/2026-08-(?:12|13)/.test(landing), `${dateClaims.length} localized dates`);
check("the release date is sourced from version.json", /^\d{4}-\d{2}-\d{2}$/.test(releaseDate || ""), releaseDate || "missing released date");
check("every landing locale carries current Account Center acquisition copy",
  panelAcquisitionClaims.length === languageCodes.length * panelAcquisitionKeys.length &&
  panelAcquisitionClaims.every(claim => typeof claim.value === "string" && claim.value.trim() && !/\b(?:35|88)\s*MB\b/i.test(claim.value)) &&
  JSON.stringify(panelOverlayCodes) === JSON.stringify(expectedPanelOverlayCodes) &&
  panelOverlayCodes.every(code => panelAcquisitionKeys.every(key =>
    typeof localeContext.PANEL_ACQ_L[code][key] === "string" && localeContext.PANEL_ACQ_L[code][key].trim())),
  panelAcquisitionClaims.filter(claim => !claim.value || /\b(?:35|88)\s*MB\b/i.test(claim.value))
    .map(claim => `${claim.language}.${claim.key}`).join(", ") || "missing claims");
/* Inventory copy is DERIVED, never typed. The literal list that used to live
   here pinned "One-Tap 131" and passed for seven waves while the app rendered
   138 — a test can only certify a number it does not itself invent. The app's
   own statline fallbacks are the reference; verify_landing_counts.js then
   proves those fallbacks equal what the running app paints, which closes the
   loop without either file naming a number.

   "Smart Workflow" is ambiguous on this page by design: the web-app column
   quotes the app's total, the Photoshop column quotes the panel's nine. Both
   are accepted here and told apart precisely in verify_landing_counts.js. */
const inventory = {
  "One-Tap": (html.match(/<b id="stTapCount">(\d+)<\/b>/) || [])[1],
  "Visual Library": (html.match(/<b id="stLibCount">(\d+)<\/b>/) || [])[1],
  "Smart Workflow": (html.match(/<b id="stWfCount">(\d+)<\/b>/) || [])[1],
};
const panelWorkflowCount = (() => {
  try {
    const registry = execFileSync("unzip", ["-p", panelArtifact, "src/workflows/workflow-registry.js"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    const block = (registry.match(/var\s+WORKFLOWS\s*=\s*\[([\s\S]*?)\n\];/) || [])[1] || "";
    return String([...block.matchAll(/\bid:\s*"[^"]+",\s*title:\s*"[^"]+"/g)].length);
  } catch (error) { return ""; }
})();
function staleInventory(source) {
  const stale = [];
  for (const [label, want] of Object.entries(inventory)) {
    if (!want) { stale.push(`${label}: no statline fallback to derive from`); continue; }
    const found = [...source.matchAll(new RegExp(label.replace(/ /g, "\\s") + "(?: Studio| Pro| Controls)?\\s*(\\d+)", "g"))].map(m => m[1]);
    if (!found.length) { stale.push(`${label}: never advertised`); continue; }
    const wrong = [...new Set(found.filter(v => v !== want && !(label === "Smart Workflow" && v === panelWorkflowCount)))];
    if (wrong.length) stale.push(`${label} ${wrong.join("/")} vs ${want}`);
  }
  return stale;
}
const landingStale = staleInventory(landing);
/* v6.22.0 — this line used to read `landing.includes("907")`, four lines under
   a comment explaining that a test can only certify a number it does not
   itself invent. Nothing in this repository produced 907, so the assertion
   proved only that somebody had typed the same number twice. The advertised
   test count is now derived from the workflow that runs the tests, in
   verify_landing_counts.js check H, which is where every other derived count
   already lives. */
check("landing inventory copy matches the shipped web app",
  landingStale.length === 0 && !["1,081", "1,134"].some(value => landing.includes(value)),
  landingStale.length ? landingStale.join("; ") : "a stale inventory total is published");
const encodedProductionHome = encodeURIComponent(productionBase + "/");
const unexpectedDocsDotfiles = fs.readdirSync(path.join(ROOT, "docs"))
  .filter(name => name.startsWith(".") && name !== ".nojekyll");
const unexpectedProbeFiles = fs.readdirSync(path.join(ROOT, "docs"))
  .filter(name => /(?:auto.?live|deploy-(?:ts|check|verify))/i.test(name));

check("landing canonical and social-image fields use the exact production origin",
  [
    `<link rel="canonical" href="${productionBase}/">`,
    `<meta property="og:url" content="${productionBase}/">`,
    `<meta property="og:image" content="${productionBase}/og-image.jpg">`,
    `<meta name="twitter:image" content="${productionBase}/og-image.jpg">`
  ].every(value => landing.includes(value)),
  "landing canonical, Open Graph, or Twitter image drifted");
check("app canonical, social-image, and share fields use the exact production origin",
  [
    `<link rel="canonical" href="${productionBase}/app/">`,
    `<meta property="og:url" content="${productionBase}/app/">`,
    `<meta property="og:image" content="${productionBase}/app/og-app.jpg">`,
    `<meta name="twitter:image" content="${productionBase}/app/og-app.jpg">`,
    `var APP_URL = "${productionBase}/app/";`
  ].every(value => html.includes(value)),
  "app canonical, Open Graph, Twitter, or share URL drifted");
check("structured metadata sends panel acquisition through the account center",
  webAppSchema.url === `${productionBase}/app/` &&
  panelSchema.url === `${productionBase}/app/?panel=download` &&
  !("downloadUrl" in panelSchema),
  "JSON-LD exposes a public panel download instead of the account center");
check("Telegram and Facebook share the exact production homepage",
  landing.includes(`https://t.me/share/url?url=${encodedProductionHome}&amp;text=`) &&
  landing.includes(`https://www.facebook.com/sharer/sharer.php?u=${encodedProductionHome}`),
  "Telegram or Facebook share target drifted");
check("SEO discovery files use the production origin",
  robots.includes(`Sitemap: ${productionBase}/sitemap.xml`) &&
  sitemap.includes(`<loc>${productionBase}/</loc>`) &&
  sitemap.includes(`<loc>${productionBase}/app/</loc>`),
  "robots.txt or sitemap.xml uses the wrong origin");
check("the panel agrees with itself about which version it is",
  panelInternals.version === panelVersion && panelInternals.brandVer === panelVersion,
  `main.js ${panelInternals.version || "?"}, index.html ${panelInternals.brandVer || "?"}, published ${panelVersion}${panelInternals.err ? " :: " + panelInternals.err : ""}`);
check("the panel's update probe points at the production origin",
  panelInternals.updateUrl === `${productionBase}/download/panel-version.json`,
  panelInternals.updateUrl || "no PANEL_VERSION_URL found");
/* v5.36.0 — the first version of the check above pulled three named values out
   of the .ccx and declared the retired host handled. It was not: the panel's
   mini-browser still led its shortcut row with two links to
   hlaingkhay28047-svg.github.io, and WEB_ALLOWED still whitelisted it. Naming
   the places to look is how a check misses the place you did not name, so this
   one reads the two files whole. */
check("the retired GitHub Pages host appears nowhere inside the panel",
  panelInternals.retiredHostHits === 0,
  `${panelInternals.retiredHostHits} reference(s) in the shipped main.js/index.html`);
/* v5.36.0 — WHERE THE BUTTONS GO.

   Ninety-five test scripts, and not one of them read an href. This wave found
   out the hard way: a single unbounded string replace, meant for the panel
   download button, also hit the hero's "Try Web Studio — no install" CTA and
   the Web Studio section's CTA, because all three shared a prefix. For one
   commit the landing page's primary top-of-funnel button, in all 37 languages,
   started a 35MB Photoshop-plugin download instead of opening the web app. The
   whole suite stayed green, because every landing assertion in it reads TEXT.

   The explicit route contracts below keep Web Studio CTAs on the app and send
   Panel acquisition through Account Center. Any public installer href or
   download attribute is red here rather than live. */
const anchors = [...landing.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(m => ({
  attrs: m[1],
  href: (m[1].match(/\bhref="([^"]*)"/) || [])[1] || "",
  download: /(?:^|\s)download(?:\s|=|$)/.test(m[1]),
  key: (m[2].match(/data-i18n="([^"]+)"/) || [])[1] || "",
}));
const webStudioCtaKeys = ["nav.cta", "hero.cta1", "s4.cta", "duo1.cta"];
const ctaAnchors = anchors.filter(a => webStudioCtaKeys.includes(a.key));
const misroutedCtas = ctaAnchors.filter(a => a.href !== "app/" || a.download)
  .map(a => `${a.key} -> ${a.href}${a.download ? " [download]" : ""}`);
check("every Web Studio call to action opens the web app",
  ctaAnchors.length === webStudioCtaKeys.length && misroutedCtas.length === 0,
  misroutedCtas.length ? misroutedCtas.join("; ")
    : `found ${ctaAnchors.length} of ${webStudioCtaKeys.length} CTAs`);

const expectedCcx = `download/HNK_Ai_Panel_v${panelVersion}.ccx`;
const panelAccountHref = "app/?panel=download";
const panelCtaKeys = ["hero.cta2", "s5.dl"];
const panelCtas = anchors.filter(a => panelCtaKeys.includes(a.key));
const publicPanelLeaks = anchors.filter(a => a.download || /\.ccx(?:$|[?#])/i.test(a.href));
check("public Panel calls to action open the Account Center",
  panelCtas.length === panelCtaKeys.length &&
  panelCtas.every(a => a.href === panelAccountHref && !a.download),
  panelCtas.map(a => `${a.key} -> ${a.href}${a.download ? " [download]" : ""}`).join("; "));
check("the landing page exposes no direct installer link",
  publicPanelLeaks.length === 0,
  publicPanelLeaks.map(a => `${a.key || "(no key)"} -> ${a.href}`).join("; ") || "none");

/* the sticky CTA is cloned in JS, so its destination lives in a string literal
   rather than in the markup the two checks above can see */
check("the sticky call to action clone also opens the web app",
  /a\.href\s*=\s*"app\/"\s*;[\s\S]{0,400}?a\.setAttribute\("data-i18n",\s*"hero\.cta1"\)/.test(landing),
  "the scripted sticky CTA no longer points at app/");

check("retired GitHub Pages and repository URLs are absent",
  ![landing, html, robots, sitemap].some(value => value.includes("hlaingkhay28047-svg.github.io/TG")) &&
  !landing.includes("hlaingkhay28047-svg/HNK-Ai-V1") &&
  landing.includes("https://github.com/hlaingkhay28047-svg/TG"),
  "a canonical, share, or repository link is stale");
check("both social preview images exist in the published site",
  fs.existsSync(path.join(ROOT, "docs/og-image.jpg")) &&
  fs.existsSync(path.join(ROOT, "docs/app/og-app.jpg")),
  "an Open Graph image is missing");
/* Same derivation, turned on the app itself: its three link-preview
   descriptions must quote the numbers its own statline shows. They did not —
   all three said One-Tap 131 against a rendered 138, and no <meta> tag is ever
   re-read by a human. */
const appStale = staleInventory(html);
check("web-app metadata and initial DOM inventory match the shipped UI",
  appStale.length === 0 && Object.values(inventory).every(Boolean),
  appStale.length ? appStale.join("; ") : "a statline fallback is missing");
check("temporary deployment probes are not published",
  unexpectedDocsDotfiles.length === 0 && unexpectedProbeFiles.length === 0 &&
  !fs.existsSync(path.join(ROOT, "docs/.auto-live-check")) &&
  !fs.existsSync(path.join(ROOT, "docs/.deploy-ts")) &&
  !fs.existsSync(path.join(ROOT, "docs/autolive-verify-20260817-0935.json")),
  `unexpected dotfiles: ${unexpectedDocsDotfiles.join(", ") || "none"}; probes: ${unexpectedProbeFiles.join(", ") || "none"}`);
const accountCardStart = html.indexOf('<section class="card" id="cardAccount">');
const accountCardEnd = html.indexOf("</section>", accountCardStart);
const accountCard = accountCardStart >= 0 && accountCardEnd > accountCardStart
  ? html.slice(accountCardStart, accountCardEnd)
  : "";
const ccxHref = `../${expectedCcx}`;
const ccxHrefCount = html.split(`href="${ccxHref}"`).length - 1;
check("the published Photoshop panel download lives only in the Account Center",
  ccxHrefCount === 1 && accountCard.includes(`id="accGrpPanel"`) &&
  accountCard.includes(`id="accPanelDownload"`) && accountCard.includes(`href="${ccxHref}"`) &&
  /accGrpPanel[\s\S]{0,2500}?isPremium\(\)/.test(html),
  `panel ${panelVersion}; links ${ccxHrefCount}; account group ${accountCard.includes('id="accGrpPanel"')}`);
check("no other published page or script exposes an installer reference",
  publishedCcxReferences.length === 1 && publishedCcxReferences[0].file === "docs/app/index.html" &&
  publishedCcxReferences[0].value === ccxHref,
  publishedCcxReferences.map(ref => `${ref.file}: ${ref.value}`).join("; ") || "no Account Center installer reference");
check("the published Photoshop panel archive is valid and versioned", panelArtifactOk, panelArtifactDetail);

check("GitHub Actions checkout is pinned to reviewed v7.0.1", checkoutSha === "3d3c42e5aac5ba805825da76410c181273ba90b1", checkoutSha || "missing full commit SHA");
check("GitHub Actions setup-node is pinned to reviewed v7.0.0", setupNodeSha === "820762786026740c76f36085b0efc47a31fe5020", setupNodeSha || "missing full commit SHA");
check("CI runs on the current even-numbered Node LTS", nodeMajor === 24, `Node ${nodeMajor || "?"}`);
check("CI uses a stable Ubuntu 24.04 runner", /runs-on:\s*ubuntu-24\.04/.test(workflow), "runner is not pinned");
check("CI grants only read access to repository contents", /permissions:\s*\n\s*contents:\s*read/.test(workflow) && !/:\s*write\b/.test(workflow), "missing contents: read or a write permission is present");
check("checkout does not persist write-capable credentials", /actions\/checkout@[^\s]+[\s\S]*?persist-credentials:\s*false/.test(workflow), "missing persist-credentials: false");
check("setup-node package caching is explicitly disabled", /actions\/setup-node@[^\s]+[\s\S]*?package-manager-cache:\s*false/.test(workflow), "missing package-manager-cache: false");
check("Playwright and its installer stay pinned", /npm install playwright@1\.62\.1\b/.test(workflow) && /\.\/node_modules\/\.bin\/playwright install --with-deps chromium/.test(workflow), "expected a fully pinned local Playwright install");

check("the production spec uses authenticated GitHub autodeploy", /github:\s*[\s\S]*?repo:\s*hlaingkhay28047-svg\/TG[\s\S]*?branch:\s*main[\s\S]*?deploy_on_push:\s*true/.test(appSpec), "missing github deploy_on_push");
check("the public one-click template remains a direct public-git source", /git:\s*[\s\S]*?branch:\s*main[\s\S]*?repo_clone_url:\s*https:\/\/github\.com\/hlaingkhay28047-svg\/TG\.git/.test(deployTemplate) && !/deploy_on_push:/.test(deployTemplate), "one-click source contract drifted");
check("deployment docs explain the one-click/manual-deploy boundary", /one-click[\s\S]*manual(?:ly)? deploy/i.test(readme) && /authenticated GitHub/i.test(readme), "README lacks the production migration note");
check("deployment docs require both lane tokens before pushing",
  readme.includes("DIGITALOCEAN_STAGING_ACCESS_TOKEN") &&
  readme.includes("DIGITALOCEAN_PRODUCTION_ACCESS_TOKEN") &&
  /must exist\s+before pushing/i.test(readme),
  "README lacks the pre-push DigitalOcean credential gate");
check("deployment docs distinguish liveness, readiness and health",
  readme.includes("`/api/live`") && readme.includes("`/api/ready`") &&
  readme.includes("`/api/health`") && /startup\/schema traffic gate/i.test(readme),
  "README lacks the three-endpoint probe contract");
check("deployment docs require native rollback to restore code and app spec together",
  /native \*\*Activity → Rollback\*\*/.test(readme) &&
  /restores the\s+previous code, configuration, and app spec together/i.test(readme) &&
  /does not roll back\s+database data/i.test(readme),
  "README lacks the safe post-probe rollback procedure");

/* The two backends deliberately use different platform object names. Supabase
   owns auth/storage schemas; DigitalOcean's restricted runtime cannot CREATE
   SCHEMA, so its tracked source_dir dialect keeps the same model in public
   with hnk_ names. The transform stays mechanical so policy logic cannot drift
   while the platform boundary remains explicit. */
const nativeSchema = read("supabase/schema.sql");
const dialectMap = [
  ["auth.hnk_roleless_runtime()", "public.hnk_roleless_runtime()", 9],
  ["auth.uid()", "public.hnk_uid()", 24],
  ["auth.users", "public.hnk_auth_users", 9],
  ["storage.buckets", "public.hnk_storage_buckets", 1],
  ["storage.objects", "public.hnk_storage_objects", 7],
  ["storage.foldername", "public.hnk_foldername", 2],
];
const dialectCounts = dialectMap.map(([native]) =>
  nativeSchema.split(native).length - 1);
check("the reviewed schema-dialect dependency inventory is unchanged",
  dialectCounts.every((count, i) => count === dialectMap[i][2]),
  `got ${dialectCounts.join(",")}`);
const digitalOceanSchema = dialectMap.reduce(
  (sql, [native, roleless]) => sql.replaceAll(native, roleless), nativeSchema);
check("DigitalOcean schema is the deterministic public-schema dialect",
  read("server/sql/schema.sql") === digitalOceanSchema,
  "server/sql/schema.sql has policy drift beyond the reviewed name transform");
const executableDigitalOceanSchema = digitalOceanSchema
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--[^\n]*/g, "");
check("DigitalOcean executable SQL has no native auth/storage dependency",
  !/\b(?:auth|storage)\./.test(executableDigitalOceanSchema),
  "server dialect still requires a non-public schema");

const serverPackage = JSON.parse(read("server/package.json"));
check("the API build preserves its tracked DigitalOcean schema",
  /accessSync\(['\"]sql\/schema\.sql['\"]\)/.test(serverPackage.scripts.build || "") &&
    !/supabase|\bcp\b/.test(serverPackage.scripts.build || ""),
  "server build may overwrite the DigitalOcean dialect");

if (failures.length) {
  console.error(`\nFAIL — ${failures.length} release contract check(s) failed`);
  process.exit(1);
}

console.log("\nPASS — release, CI, and deployment contracts are coordinated");
