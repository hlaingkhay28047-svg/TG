"use strict";

/* Static route contract for the unified HNK website. This deliberately reads
 * the publishable tree rather than mocking a router: DigitalOcean serves docs/
 * directly, so a missing index document is a missing production route. */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let failed = 0;
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }
function check(name, ok, detail) {
  if (ok) console.log("PASS — " + name);
  else { failed++; console.error("FAIL — " + name + (detail ? "\n       " + detail : "")); }
}

const routes = ["docs/index.html", "docs/app/index.html", "docs/admin/index.html", "docs/download/index.html"];
routes.forEach(rel => check(rel + " exists", fs.existsSync(path.join(ROOT, rel)), "missing production route document"));

const landing = read("docs/index.html");
const app = read("docs/app/index.html");
const adminRoute = read("docs/admin/index.html");
const downloadRoute = read("docs/download/index.html");
const sitemap = read("docs/sitemap.xml");

const publicSections = ["home", "features", "course", "pricing", "tutorial", "faq", "contact", "login"];
publicSections.forEach(id => {
  check("landing exposes #" + id, new RegExp(`id=["']${id}["']`).test(landing), "required public destination is absent");
  check("landing navigation reaches #" + id,
    new RegExp(`href=["']#${id}["']`).test(landing), "required destination is not reachable from public navigation");
});

/* v6.3.0 — asked of the SHIPPING versions rather than of two numbers typed
   into this file. Hard-coded literals had to be hand-edited every release,
   which made a forgotten edit look like a failing test rather than a stale
   landing page; read from the app and the release manifest, this check can
   never go stale and still fails the moment the landing lags behind them. */
const APP_VER = (app.match(/var\s+APP_VER\s*=\s*["']([^"']+)["']/) || [])[1];
const PANEL_VER = JSON.parse(read("panel/release-manifest.json")).version;
check("the web app declares a version at all", !!APP_VER, "APP_VER is missing");
check("landing advertises Web Studio " + APP_VER,
  new RegExp("Web Studio\\s+(?:<[^>]+>)*v" + APP_VER.replace(/\./g, "\\.")).test(landing),
  "release copy is stale — the landing does not name the version the app reports");
check("landing advertises Panel " + PANEL_VER,
  new RegExp("Panel(?:[^\\n<]|<[^>]+>){0,80}v" + PANEL_VER.replace(/\./g, "\\.")).test(landing),
  "panel copy is stale — the landing does not name the version the release manifest pins");
/* the suite-size claim is NOT checked here: verify_landing_counts.js owns it,
   across all 27 locale records and both share cards. Two tests owning one
   claim is how they come to disagree. */
check("the app's published version.json agrees with APP_VER",
  JSON.parse(read("docs/app/version.json")).v === APP_VER,
  "version.json and APP_VER disagree — the update check would tell a student the wrong thing");

check("admin and authenticated download routes stay out of search indexes",
  /name=["']robots["'][^>]+noindex/i.test(adminRoute) && /name=["']robots["'][^>]+noindex/i.test(downloadRoute));
check("private admin and download routes stay out of the public sitemap",
  !/<loc>[^<]+\/(?:admin|download)\/<\/loc>/.test(sitemap));

const publicFrontend = [landing, app];
if (fs.existsSync(path.join(ROOT, "docs/admin/index.html"))) publicFrontend.push(read("docs/admin/index.html"));
if (fs.existsSync(path.join(ROOT, "docs/download/index.html"))) publicFrontend.push(read("docs/download/index.html"));
for (const rel of ["docs/admin/admin.js", "docs/download/download.js"]) {
  if (fs.existsSync(path.join(ROOT, rel))) publicFrontend.push(read(rel));
}
check("no frontend contains a permanent CCX link",
  !publicFrontend.some(text => /(?:href\s*=|location(?:\.href)?\s*=)[^\n]{0,200}\.ccx(?:["'?#]|$)/i.test(text)),
  "the client must request an expiring URL only after an authenticated action");

if (failed) process.exit(1);
console.log("\nPASS — unified public routes and navigation contract");
