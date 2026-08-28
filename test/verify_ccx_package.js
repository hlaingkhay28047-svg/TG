"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "panel");
const METADATA = path.join(SOURCE, "release-manifest.json");
const PACKAGE_SCRIPT = path.join(SOURCE, "package.sh");
const artifactInput = process.env.HNK_PANEL_ARTIFACT || process.argv[2] || "";
const artifact = artifactInput ? path.resolve(artifactInput) : "";
let failures = 0;

function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` :: ${detail}`}`);
  if (!ok) failures++;
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

check("panel source includes a deterministic packaging command",
  fs.existsSync(PACKAGE_SCRIPT), "panel/package.sh missing");
check("tracked panel release metadata exists", fs.existsSync(METADATA), METADATA);

if (fs.existsSync(PACKAGE_SCRIPT)) {
  const noOutput = spawnSync(PACKAGE_SCRIPT, [], { cwd: ROOT, encoding: "utf8" });
  const repositoryOutput = spawnSync(PACKAGE_SCRIPT,
    [path.join(ROOT, "HNK_Ai_Panel_v6.25.0.ccx")], { cwd: ROOT, encoding: "utf8" });
  check("packaging requires an explicit output path",
    noOutput.status === 64 && /Usage:/i.test(noOutput.stderr || ""),
    `exit ${noOutput.status}: ${(noOutput.stderr || "").trim()}`);
  check("packaging refuses output anywhere inside the public repository",
    repositoryOutput.status === 64 && /Refusing repository output path/i.test(repositoryOutput.stderr || ""),
    `exit ${repositoryOutput.status}: ${(repositoryOutput.stderr || "").trim()}`);
}

check("an explicit absolute artifact path was supplied",
  Boolean(artifactInput) && path.isAbsolute(artifactInput),
  "set HNK_PANEL_ARTIFACT=/absolute/outside-repository/HNK_Ai_Panel_vX.Y.Z.ccx");
check("the explicit artifact path is outside the public repository",
  Boolean(artifact) && !inside(ROOT, artifact), artifact || "missing");
check("the explicit untracked artifact exists",
  Boolean(artifact) && fs.existsSync(artifact), artifact || "missing");

if (fs.existsSync(METADATA)) {
  const metadata = JSON.parse(fs.readFileSync(METADATA, "utf8"));
  const sourceManifestPath = path.join(SOURCE, "manifest.json");
  const sourceManifest = fs.existsSync(sourceManifestPath)
    ? JSON.parse(fs.readFileSync(sourceManifestPath, "utf8")) : {};
  check("panel version is coordinated across release metadata and source",
    metadata.version === "6.25.0" && metadata.minimum_supported_version === metadata.version &&
    sourceManifest.version === metadata.version,
    JSON.stringify({ metadata: metadata.version, minimum: metadata.minimum_supported_version,
      manifest: sourceManifest.version }));
  check("release metadata names the versioned private artifact",
    metadata.artifact_file === `HNK_Ai_Panel_v${metadata.version}.ccx`,
    metadata.artifact_file || "missing");
  check("the supplied artifact filename matches release metadata",
    Boolean(artifact) && path.basename(artifact) === metadata.artifact_file,
    artifact ? path.basename(artifact) : "missing");

  if (artifact && fs.existsSync(artifact) && !inside(ROOT, artifact)) {
    let entries = [];
    let archiveManifest = {};
    let archiveMain = "";
    let archiveIndex = "";
    try {
      execFileSync("unzip", ["-tqq", artifact], { stdio: "pipe" });
      entries = execFileSync("unzip", ["-Z1", artifact], { encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024 }).trim().split(/\r?\n/).filter(Boolean);
      archiveManifest = JSON.parse(execFileSync("unzip", ["-p", artifact, "manifest.json"], { encoding: "utf8" }));
      archiveMain = execFileSync("unzip", ["-p", artifact, "main.js"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      archiveIndex = execFileSync("unzip", ["-p", artifact, "index.html"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    } catch (error) {
      check("private CCX archive passes ZIP integrity", false, error.message);
    }
    check("private CCX archive passes ZIP integrity", entries.length > 0, `${entries.length} entries`);
    const unsafe = entries.filter(entry => entry.startsWith("/") || /(?:^|\/)\.\.(?:\/|$)/.test(entry));
    check("archive contains no absolute or traversal paths", unsafe.length === 0, unsafe.join(", ") || "none");
    check("archive contains no duplicate entry names", new Set(entries).size === entries.length,
      `${entries.length - new Set(entries).size} duplicates`);
    check("archive excludes repository-only release files",
      !entries.some(entry => ["package.sh", "PERMISSIONS.md", "release-manifest.json"].includes(entry)),
      entries.filter(entry => ["package.sh", "PERMISSIONS.md", "release-manifest.json"].includes(entry)).join(", ") || "none");
    check("archive manifest/main/header versions match release metadata",
      archiveManifest.version === metadata.version &&
      (archiveMain.match(/const PANEL_VERSION\s*=\s*"([^"]+)"/) || [])[1] === metadata.version &&
      (archiveIndex.match(/id="brandVer">v([0-9.]+)</) || [])[1] === metadata.version,
      JSON.stringify({ manifest: archiveManifest.version,
        main: (archiveMain.match(/const PANEL_VERSION\s*=\s*"([^"]+)"/) || [])[1],
        header: (archiveIndex.match(/id="brandVer">v([0-9.]+)</) || [])[1] }));
    const digest = crypto.createHash("sha256").update(fs.readFileSync(artifact)).digest("hex");
    check("release metadata pins the exact artifact SHA-256 and byte size",
      metadata.sha256 === digest && metadata.bytes === fs.statSync(artifact).size,
      JSON.stringify({ expectedSha: metadata.sha256, actualSha: digest,
        expectedBytes: metadata.bytes, actualBytes: fs.statSync(artifact).size }));
    const coreFiles = ["manifest.json", "index.html", "main.js", "styles.css"];
    const mismatched = coreFiles.filter(file => fs.existsSync(path.join(SOURCE, file)) &&
      execFileSync("unzip", ["-p", artifact, file]).compare(fs.readFileSync(path.join(SOURCE, file))) !== 0);
    check("archive core files are byte-identical to tracked panel source",
      mismatched.length === 0, mismatched.join(", ") || "none");
  }
}

if (failures) process.exit(1);
console.log("\nPrivate CCX package contract verified.");
