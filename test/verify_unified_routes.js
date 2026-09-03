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

check("landing advertises Web Studio 5.87.0", /Web Studio\s+(?:<[^>]+>)*v5\.87\.0/i.test(landing), "release copy is stale");
check("landing advertises Panel 6.58.0", /Panel(?:[^\n<]|<[^>]+>){0,80}v6\.58\.0/i.test(landing), "panel copy is stale");
check("web app reports 5.87.0", /var\s+APP_VER\s*=\s*["']5\.87\.0["']/.test(app), "APP_VER is stale");

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
