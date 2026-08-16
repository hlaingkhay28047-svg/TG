/* Focused regression check for the premium HNK header wordmark. */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "..", "docs", "app", "index.html");
const sitePath = path.join(__dirname, "..", "docs", "index.html");
const html = fs.readFileSync(appPath, "utf8");
const siteHtml = fs.readFileSync(sitePath, "utf8");

const checks = [
  [
    "semantic wordmark markup",
    /<div class="nav-name" role="img" aria-label="HNK Web Studio">\s*<span class="hnk-wordmark" aria-hidden="true">HNK<\/span>\s*<span class="hnk-studio-label" aria-hidden="true">WEB STUDIO<\/span>\s*<\/div>/
  ],
  ["gold wordmark gradient", /\.hnk-wordmark\s*\{[^}]*linear-gradient\([^}]*background-clip:text[^}]*-webkit-text-fill-color:transparent/s],
  ["soft wordmark glow", /\.hnk-wordmark\s*\{[^}]*filter:drop-shadow\(/s],
  ["animated premium shimmer", /\.hnk-wordmark\s*\{[^}]*animation:heroShine/s],
  ["brand accent line", /\.nav-name::after\s*\{[^}]*linear-gradient\(/s],
  ["reduced-motion support", /prefers-reduced-motion:\s*reduce[^}]*\.hnk-wordmark[^}]*animation:none!important/s],
  ["small-phone sizing", /@media\(max-width:379px\)[^{]*\{[^}]*\.hnk-wordmark\s*\{[^}]*font-size:/s]
];

const siteChecks = [
  [
    "landing-page semantic wordmark markup",
    /<div class="nav-name lat" role="img" aria-label="HNK Create Studio"><span class="hnk-wordmark" aria-hidden="true">HNK<\/span><span class="hnk-studio-label" aria-hidden="true">CREATE STUDIO<\/span><\/div>/
  ],
  ["landing-page decorative icon", /<img src="assets\/site\/favicon-48\.png" alt="" aria-hidden="true" width="30" height="30">/],
  ["landing-page gold wordmark gradient", /\.hnk-wordmark\s*\{[^}]*linear-gradient\([^}]*background-clip:text[^}]*-webkit-text-fill-color:transparent/s],
  ["landing-page soft wordmark glow", /\.hnk-wordmark\s*\{[^}]*filter:drop-shadow\(/s],
  ["landing-page premium shimmer", /\.hnk-wordmark\s*\{[^}]*animation:hnkShine/s],
  ["landing-page brand accent line", /\.nav-name::after\s*\{[^}]*linear-gradient\(/s],
  ["landing-page reduced-motion support", /prefers-reduced-motion:reduce[^}]*\*\{[^}]*animation:none!important/s],
  ["landing-page mobile label collapse", /@media \(max-width:639px\)[^{]*\{[^}]*\.hnk-studio-label\s*\{[^}]*display:none/s],
  ["landing-page small-phone sizing", /@media \(max-width:379px\)\{[\s\S]{0,500}\.hnk-wordmark\s*\{[^}]*font-size:/]
];

const failed = checks
  .filter(([, pattern]) => !pattern.test(html))
  .map(([name]) => `app: ${name}`)
  .concat(
    siteChecks
      .filter(([, pattern]) => !pattern.test(siteHtml))
      .map(([name]) => `site: ${name}`)
  );

if (failed.length) {
  console.error("FAIL — missing HNK wordmark requirements:");
  failed.forEach(name => console.error(`- ${name}`));
  process.exit(1);
}

console.log("PASS — premium HNK wordmark is consistent across the landing page and web app");
