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

/* This is part of the release gate, not an optional packaging check. It exits
   immediately if the public Git index contains a CCX or static installer URL. */
require("./verify_no_public_ccx.js");

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
const panelRelease = JSON.parse(read("panel/release-manifest.json"));
const panelSourceManifest = JSON.parse(read("panel/manifest.json"));
const panelSourceMain = read("panel/main.js");
const panelSourceIndex = read("panel/index.html");
const panelSourceRegistry = read("panel/src/workflows/workflow-registry.js");
const panelArtifactInput = process.env.HNK_PANEL_ARTIFACT || process.argv[2] || "";
const panelArtifact = panelArtifactInput ? path.resolve(panelArtifactInput) : "";
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
  return [...source.matchAll(/(?:https?:\/\/[^\s"'<>]+|(?:\.\.?\/|\/)[^\s"'<>]+|HNK_Ai_Panel_v\d+\.\d+\.\d+)\.ccx(?:[?#][^\s"'<>]*)?/gi)].map(match => ({
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

function isInsideRepository(candidate) {
  const relative = path.relative(ROOT, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

let panelArtifactDetail = "source-only CI (no HNK_PANEL_ARTIFACT supplied)";
let panelArtifactOk = !panelArtifactInput;
if (panelArtifactInput) {
  if (!path.isAbsolute(panelArtifactInput)) {
    panelArtifactDetail = "HNK_PANEL_ARTIFACT must be an absolute path";
  } else if (isInsideRepository(panelArtifact)) {
    panelArtifactDetail = "HNK_PANEL_ARTIFACT must be outside the public repository";
  } else {
    try {
      execFileSync("unzip", ["-tqq", panelArtifact], { stdio: "pipe" });
      const archiveManifest = JSON.parse(execFileSync("unzip", ["-p", panelArtifact, "manifest.json"], { encoding: "utf8" }));
      panelArtifactOk = archiveManifest.version === panelVersion &&
        path.basename(panelArtifact) === panelRelease.artifact_file;
      panelArtifactDetail = `${path.basename(panelArtifact)}; manifest ${archiveManifest.version || "missing"}`;
    } catch (error) {
      panelArtifactDetail = error.message;
    }
  }
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
const panelInternals = {
  version: (panelSourceMain.match(/const PANEL_VERSION\s*=\s*"([^"]+)"/) || [])[1] || "",
  updateUrl: (panelSourceMain.match(/const PANEL_VERSION_URL\s*=\s*"([^"]+)"/) || [])[1] || "",
  brandVer: (panelSourceIndex.match(/id="brandVer">v([0-9.]+)</) || [])[1] || "",
  retiredHostHits: (panelSourceMain + panelSourceIndex).split("hlaingkhay28047-svg.github.io").length - 1,
  err: ""
};

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
/* v5.50.0 — RunningHub Enterprise is the one engine by owner decision. The
   check now pins BOTH halves of that: the RunningHub base URL is exactly the
   documented one, and the retired Gemini/OpenAI endpoints are truly gone from
   the shipped app — a lingering base URL would mean a lingering call path. */
check("provider credentials route directly to the one documented upstream API", /var RH_BASE\s*=\s*"https:\/\/www\.runninghub\.ai"/.test(html) && !/generativelanguage\.googleapis\.com/.test(html) && !/api\.openai\.com/.test(html), "RunningHub base URL drifted, or a retired Gemini/OpenAI endpoint lingers");
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
const panelWorkflowBlock = (panelSourceRegistry.match(/var\s+WORKFLOWS\s*=\s*\[([\s\S]*?)\n\];/) || [])[1] || "";
const panelWorkflowCount = String([...panelWorkflowBlock.matchAll(/\bid:\s*"[^"]+",\s*title:\s*"[^"]+"/g)].length);
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
check("panel source, release metadata, and public version endpoint agree",
  panelSourceManifest.version === panelVersion && panelRelease.version === panelVersion &&
  panelRelease.minimum_supported_version === panelVersion &&
  panelRelease.artifact_file === `HNK_Ai_Panel_v${panelVersion}.ccx`,
  JSON.stringify({ source: panelSourceManifest.version, release: panelRelease.version,
    minimum: panelRelease.minimum_supported_version, endpoint: panelVersion,
    artifact: panelRelease.artifact_file }));
check("the panel agrees with itself about which version it is",
  panelInternals.version === panelVersion && panelInternals.brandVer === panelVersion,
  `main.js ${panelInternals.version || "?"}, index.html ${panelInternals.brandVer || "?"}, release ${panelVersion}${panelInternals.err ? " :: " + panelInternals.err : ""}`);
check("the panel's update probe points at the production origin",
  panelInternals.updateUrl === `${productionBase}/download/panel-version.json`,
  panelInternals.updateUrl || "no PANEL_VERSION_URL found");
/* v5.46 — the download page's footer had quietly slipped TWO web releases
   ("Web App 5.43.0") because nothing read it. Every user-visible version
   badge either follows the release or gets pinned here; this one now does. */
check("the download page footer advertises the shipped web app and panel",
  read("docs/download/index.html").includes(`Web App ${appVersion} · Panel ${panelVersion}`),
  `expected "Web App ${appVersion} · Panel ${panelVersion}" in docs/download/index.html`);
/* v5.46 — a directory URL without its trailing slash (/app, /admin) is served
   as the document itself with no platform redirect, so the browser resolves
   every relative reference against the SITE ROOT: all images, sw.js and the
   stylesheet 404 while the page renders. One evening was lost to exactly
   that. Both directory-served documents must carry the boot statement that
   normalises the URL before any asset is requested. */
const SLASH_GUARD = 'location.replace(location.pathname+"/"+location.search+location.hash)';
check("the app and admin documents self-heal a slashless directory URL",
  html.includes(SLASH_GUARD) && read("docs/admin/index.html").includes(SLASH_GUARD),
  "the slashless-URL boot redirect is missing from docs/app or docs/admin");
/* v5.36.0 — the first version of the check above pulled three named values out
   of the .ccx and declared the retired host handled. It was not: the panel's
   mini-browser still led its shortcut row with two links to
   hlaingkhay28047-svg.github.io, and WEB_ALLOWED still whitelisted it. Naming
   the places to look is how a check misses the place you did not name, so this
   one reads the two files whole. */
check("the retired GitHub Pages host appears nowhere inside the panel",
  panelInternals.retiredHostHits === 0,
  `${panelInternals.retiredHostHits} reference(s) in the shipped main.js/index.html`);
check("an explicit external panel artifact is valid when supplied",
  panelArtifactOk,
  panelArtifactDetail);
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
check("the Account Center sends panel acquisition through the authenticated download area",
  accountCard.includes(`id="accGrpPanel"`) && accountCard.includes(`id="accPanelDownload"`) &&
  accountCard.includes(`href="../download/"`) &&
  /function unifiedCanDownload\(\)[\s\S]{0,500}?p\.ccx_download\s*===\s*true/.test(html) &&
  /accPanelDownload["']\);\s*if\s*\(ad\)\s*ad\.addEventListener\("click",accRequestPanelDownload\)/.test(html),
  `panel ${panelVersion}; account group ${accountCard.includes('id="accGrpPanel"')}; authenticated handler ${html.includes("accRequestPanelDownload")}`);
check("no published page or script exposes a permanent installer reference",
  publishedCcxReferences.length === 0,
  publishedCcxReferences.map(ref => `${ref.file}: ${ref.value}`).join("; ") || "none");

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

/* The two deployable schemas share one application model but intentionally do
   not share bytes. Supabase owns auth/storage schemas and native request roles;
   DigitalOcean's restricted runtime cannot create either, so its canonical
   tables reference the public identity mirror and use FORCE RLS with a
   transaction-local service context. Assert those semantics directly instead
   of pretending a name-only transform can model the different privilege
   boundaries. */
const nativeSchema = read("supabase/schema.sql");
const digitalOceanSchema = read("server/sql/schema.sql");
const executableDigitalOceanSchema = digitalOceanSchema
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--[^\n]*/g, "");
const canonicalTables = ["roles","user_roles","licenses","app_permissions",
  "device_slots","device_installations","sessions","login_history",
  "download_history","admin_audit_logs","panel_versions","device_pairing_codes",
  "device_history","admin_mfa","auth_attempts","panel_artifacts","panel_artifact_chunks"];
const hasTable = (sql, table) => new RegExp(
  "create\\s+table\\s+if\\s+not\\s+exists\\s+public\\."+table+"\\s*\\(", "i").test(sql);
check("both schema dialects package the complete canonical application model",
  canonicalTables.every(table => hasTable(nativeSchema,table)&&hasTable(digitalOceanSchema,table)),
  "a canonical table is missing from one deployable dialect");
check("both schema dialects package MFA rotation and durable auth-attempt controls",
  [nativeSchema,digitalOceanSchema].every(sql =>
    /alter\s+table\s+public\.admin_mfa\s+add\s+column\s+if\s+not\s+exists\s+pending_encrypted_secret\s+text/i.test(sql)&&
    /login_history_event_type_check[\s\S]*?'mfa_failed'/i.test(sql)&&
    /login_history_failed_ip_idx/i.test(sql)&&
    /login_history_mfa_failed_user_idx/i.test(sql)&&
    /download_history_streaming_user_idx/i.test(sql)&&
    /auth_attempts_operation_check[\s\S]*?'login_admission'[\s\S]*?'password_change'/i.test(sql)&&
    /auth_attempts_operation_ip_time_idx/i.test(sql)&&
    /auth_attempts_operation_email_ip_time_idx/i.test(sql)&&
    /auth_attempts_operation_email_time_idx/i.test(sql)&&
    /auth_attempts_occurred_at_idx/i.test(sql)),
  "an MFA/auth throttling constraint or index is missing from a dialect");
check("both schema dialects reconcile profile admin flags and revoke demoted sessions",
  [nativeSchema,digitalOceanSchema].every(sql =>
    /hnk_sync_admin_role_from_profile/i.test(sql)&&
    /after\s+insert\s+or\s+update\s+of\s+is_admin\s+on\s+public\.profiles/i.test(sql)&&
    /update\s+public\.sessions[\s\S]*?revoked_at\s*=\s*now\s*\(\s*\)/i.test(sql))&&
    /delete\s+from\s+public\.hnk_auth_refresh_tokens/i.test(digitalOceanSchema),
  "admin-role synchronization or demotion revocation is missing from a dialect");
const nativeCanonical = nativeSchema.slice(nativeSchema.indexOf("-- 10. unified accounts"));
const rolelessCanonical = executableDigitalOceanSchema.slice(
  executableDigitalOceanSchema.indexOf("create table if not exists public.roles"));
check("each schema dialect binds canonical foreign keys to its authoritative identity table",
  /references\s+auth\.users\s*\(/i.test(nativeCanonical)&&
    !/public\.hnk_auth_users/i.test(nativeCanonical)&&
    /references\s+public\.hnk_auth_users\s*\(/i.test(rolelessCanonical)&&
    !/\bauth\.users\b/i.test(rolelessCanonical),
  "native and roleless canonical identities are not separated");
check("DigitalOcean executable SQL has no native auth/storage dependency",
  !/\b(?:auth|storage)\./.test(executableDigitalOceanSchema),
  "server dialect still requires a non-public schema");
check("DigitalOcean canonical tables FORCE service-only RLS without cluster request roles",
  canonicalTables.every(table =>
    new RegExp("alter\\s+table\\s+public\\."+table+"\\s+force\\s+row\\s+level\\s+security","i").test(rolelessCanonical)&&
    new RegExp("create\\s+policy\\s+"+table+"_service_all\\s+on\\s+public\\."+table+"[\\s\\S]*?hnk_request_role\\s*\\(\\s*\\)\\s*=\\s*'service_role'","i").test(rolelessCanonical))&&
    !/\b(?:anon|authenticated)\b/i.test(rolelessCanonical),
  "roleless canonical RLS depends on a missing role or lacks FORCE/service policy");

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
