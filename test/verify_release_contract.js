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
const panelVersion = JSON.parse(read("docs/download/panel-version.json")).v;
const releaseDate = "2026-08-19";
const englishProviderFlow = "Keys are stored locally and sent only to the AI provider you choose — never through HNK servers.";
const productionBase = "https://hnk-ai-tools-3-s4nnu.ondigitalocean.app";

const appVersion = (html.match(/var APP_VER\s*=\s*"([\d.]+)"/) || [])[1] || "";
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

check("the app release is at least 5.2.0", versionAtLeast(appVersion, "5.2.0"), appVersion || "missing APP_VER");
check("APP_VER and version.json stay in lockstep", appVersion === versionJson.v, `${appVersion} vs ${versionJson.v}`);
check("the service-worker shell cache follows the app release", cacheVersion === appVersion, `${cacheVersion} vs ${appVersion}`);
check("every landing-page web-app badge advertises the shipped release", advertisedWebVersions.length > 0 && advertisedWebVersions.every(version => version === appVersion) && webAppSchema.softwareVersion === appVersion, `${[...new Set(advertisedWebVersions)].join(", ")} vs ${appVersion}`);
check("the landing page advertises every supported language", languageCodes.length === 37 && languageClaims.length >= 37 && languageClaims.every(value => /\b(?:37|၃၇)\b/.test(value)) && JSON.stringify(webAppSchema.inLanguage) === JSON.stringify(languageCodes), `${languageCodes.length} codes, ${languageClaims.length} claims`);
check("localized API-key copy describes the actual provider-only data flow", privacyClaims.length === languageCodes.length && privacyClaims.every(hasProviderOnlyFlow), `${privacyClaims.length} localized claims`);
check("fully translated landing locales do not fall back to an English privacy tail", landingNativePrivacyCodes.every(language => !effectiveLocaleValue("key.body", language).includes(englishProviderFlow)), "an English-only disclosure leaked into localized copy");
check("the web app describes the same provider-only API-key flow in every locale", appPrivacyClaims.length === languageCodes.length && appPrivacyClaims.every(hasProviderOnlyFlow), `${appPrivacyClaims.length} localized app notices`);
check("fully translated app locales do not fall back to an English privacy note", appNativePrivacyCodes.every(language => !effectiveAppLocaleValue("key_note", language).includes(englishProviderFlow)), "an English-only notice leaked into localized copy");
check("provider credentials route directly to the documented upstream APIs", /var API_BASE\s*=\s*"https:\/\/generativelanguage\.googleapis\.com\/v1beta"/.test(html) && /var RH_BASE\s*=\s*"https:\/\/www\.runninghub\.ai"/.test(html) && /var OA_BASE\s*=\s*"https:\/\/api\.openai\.com\/v1"/.test(html), "Gemini, RunningHub, or OpenAI base URL drifted");
check("the landing page carries the current release date in every locale", dateClaims.length >= 35 && dateClaims.every(value => value.includes(releaseDate)) && !/2026-08-(?:12|13)/.test(landing), `${dateClaims.length} localized dates`);
check("landing inventory copy matches the shipped web app",
  ["One-Tap 131", "Visual Library 1850", "Smart Workflow 131", "Meitu 162", "Evoto Pro 213", "907"].every(value => landing.includes(value)) &&
  !["One-Tap 123", "Visual Library 607", "Smart Workflow 116", "Meitu 79", "Evoto Pro 79", "1,081", "1,134"].some(value => landing.includes(value)),
  "landing inventory or test-count copy is stale");
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
check("structured metadata uses exact production app and download URLs",
  webAppSchema.url === `${productionBase}/app/` &&
  panelSchema.url === `${productionBase}/#panel` &&
  panelSchema.downloadUrl === `${productionBase}/download/HNK_Ai_Panel_v${panelVersion}.ccx`,
  "JSON-LD app, panel, or download URL drifted");
check("Telegram and Facebook share the exact production homepage",
  landing.includes(`https://t.me/share/url?url=${encodedProductionHome}&amp;text=`) &&
  landing.includes(`https://www.facebook.com/sharer/sharer.php?u=${encodedProductionHome}`),
  "Telegram or Facebook share target drifted");
check("SEO discovery files use the production origin",
  robots.includes(`Sitemap: ${productionBase}/sitemap.xml`) &&
  sitemap.includes(`<loc>${productionBase}/</loc>`) &&
  sitemap.includes(`<loc>${productionBase}/app/</loc>`),
  "robots.txt or sitemap.xml uses the wrong origin");
check("retired GitHub Pages and repository URLs are absent",
  ![landing, html, robots, sitemap].some(value => value.includes("hlaingkhay28047-svg.github.io/TG")) &&
  !landing.includes("hlaingkhay28047-svg/HNK-Ai-V1") &&
  landing.includes("https://github.com/hlaingkhay28047-svg/TG"),
  "a canonical, share, or repository link is stale");
check("both social preview images exist in the published site",
  fs.existsSync(path.join(ROOT, "docs/og-image.jpg")) &&
  fs.existsSync(path.join(ROOT, "docs/app/og-app.jpg")),
  "an Open Graph image is missing");
check("web-app metadata and initial DOM inventory match the shipped UI",
  ["One-Tap 131", "Visual Library 1850", "Smart Workflow 131", "Meitu Studio 162", "Evoto Pro 213"].every(value => html.includes(value)) &&
  html.includes('<b id="stTapCount">131</b>') &&
  html.includes('<b id="stLibCount">1850</b>') &&
  html.includes('<b id="stWfCount">131</b>') &&
  !["Smart Workflow 115", "Meitu Studio 50", "Evoto Pro 42", '<b id="stTapCount">128</b>', '<b id="stWfCount">115</b>'].some(value => html.includes(value)),
  "app metadata or initial inventory is stale");
check("temporary deployment probes are not published",
  unexpectedDocsDotfiles.length === 0 && unexpectedProbeFiles.length === 0 &&
  !fs.existsSync(path.join(ROOT, "docs/.auto-live-check")) &&
  !fs.existsSync(path.join(ROOT, "docs/.deploy-ts")) &&
  !fs.existsSync(path.join(ROOT, "docs/autolive-verify-20260817-0935.json")),
  `unexpected dotfiles: ${unexpectedDocsDotfiles.join(", ") || "none"}; probes: ${unexpectedProbeFiles.join(", ") || "none"}`);
check("the web app downloads the published Photoshop panel", html.includes(`HNK_Ai_Panel_v${panelVersion}.ccx`) && html.includes(`CCX Download (v${panelVersion})`), `panel ${panelVersion}`);
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

if (failures.length) {
  console.error(`\nFAIL — ${failures.length} release contract check(s) failed`);
  process.exit(1);
}

console.log("\nPASS — release, CI, and deployment contracts are coordinated");
