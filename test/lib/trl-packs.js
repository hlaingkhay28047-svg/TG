/* v6.92.0 — THE PACKS LEFT THE SHELL. The web app loads only the chosen
   language's native pack (data/trl-<code>.js); a test that reads TR_L for
   every language, or switches LANG at runtime and expects native text, loads
   all eighteen here — into the same object the app's t() reads, exactly as
   the studio lifter does. */
"use strict";
const A = require("../../tools/lib/app-data.js");
async function loadAll(page) {
  await page.evaluate(function (packs) {
    window.HNK_TRL = window.HNK_TRL || {};
    Object.keys(packs).forEach(function (c) { window.HNK_TRL[c] = packs[c]; });
  }, A.readTrl());
}
module.exports = { loadAll, CODES: A.TRL_CODES };
