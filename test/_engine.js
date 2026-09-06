/* v6.27.0 — CROSS-ENGINE PRELOAD. Every browser test in this suite opens
   `require("playwright").chromium`. The cross-engine lane preloads this file
   (NODE_OPTIONS=--require) with HNK_ENGINE=webkit or firefox, and the same
   test then runs, unchanged, on that engine. Nothing happens without the
   variable, so the ordinary Chromium run is byte-for-byte what it was. */
const eng = process.env.HNK_ENGINE;
if (eng && eng !== "chromium") {
  const pw = require("playwright");
  if (!pw[eng]) throw new Error("HNK_ENGINE must be webkit or firefox, got " + eng);
  Object.defineProperty(pw, "chromium", { value: pw[eng], configurable: true, enumerable: true });
}
