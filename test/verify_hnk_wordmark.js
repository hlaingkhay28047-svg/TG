/* Focused regression check for the premium HNK header wordmark. */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "..", "docs", "app", "index.html");
const html = fs.readFileSync(appPath, "utf8");

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

const failed = checks.filter(([, pattern]) => !pattern.test(html)).map(([name]) => name);

if (failed.length) {
  console.error("FAIL — missing HNK wordmark requirements:");
  failed.forEach(name => console.error(`- ${name}`));
  process.exit(1);
}

console.log("PASS — premium HNK wordmark markup, effects, motion safety, and mobile sizing are present");
