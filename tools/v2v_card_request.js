/* The request a Video Smart Workflow card actually sends, for one card.
 *
 * WHY. The render lane that builds the cards' before/after art has to submit
 * the same call the shipped card submits, or the picture on the card is a
 * picture of something else. Hand-rolling that JSON in bash drifted the moment
 * the deck grew past two look-alike cards: three cards send no prompt, four
 * take no reference photograph, five carry option defaults, and only two carry
 * keepOriginalSound. So the lane asks the APP for the body instead — this
 * reads RH_VTOOL_MODELS, RH_VT_WH and rhVtBody out of docs/app/index.html and
 * runs the app's own builder over the card's own model and opts.
 *
 * Nothing here invents an apiPath: the path printed is the descriptor's, and a
 * card naming a tool the catalog does not carry fails before it can submit.
 *
 * Usage:
 *   node tools/v2v_card_request.js keys
 *   node tools/v2v_card_request.js <key|index> <videoUrl> [imageUrl]
 *     -> {"key":…,"apiPath":…,"needsImage":…,"maxSecs":…,"body":{…}}
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const WF = require(path.join(ROOT, "panel", "js", "hnk_video_tool_wf.js")).WF;

function decl(name, open, close) {
  const i = APP.indexOf("var " + name + " = " + open);
  if (i < 0) throw new Error("not found: " + name);
  const start = APP.indexOf(open, i);
  let d = 0;
  for (let k = start; k < APP.length; k++) {
    if (APP[k] === open) d++;
    else if (APP[k] === close) { d--; if (!d) return APP.slice(start, k + 1); }
  }
  throw new Error("unterminated: " + name);
}
function fn(name) {
  const i = APP.indexOf("function " + name + "(");
  if (i < 0) throw new Error("not found: " + name);
  const start = APP.indexOf("{", i);
  let d = 0;
  for (let k = start; k < APP.length; k++) {
    if (APP[k] === "{") d++;
    else if (APP[k] === "}") { d--; if (!d) return APP.slice(i, k + 1); }
  }
  throw new Error("unterminated: " + name);
}

/* the app's own catalog and its own builder, evaluated as the app defines
   them — not a re-implementation that can disagree */
const RH_VTOOL_MODELS = eval(decl("RH_VTOOL_MODELS", "[", "]"));
const RH_VT_WH = eval("(" + decl("RH_VT_WH", "{", "}") + ")");
const rhVtBody = eval("(" + fn("rhVtBody").replace(/^function\s+rhVtBody/, "function") + ")");

function card(sel) {
  const w = /^\d+$/.test(String(sel)) ? WF[Number(sel)] : WF.find(x => x.key === sel);
  if (!w) throw new Error("no such card: " + sel);
  return w;
}
function request(sel, videoUrl, imageUrl) {
  const w = card(sel);
  const def = RH_VTOOL_MODELS.find(t => t.id === w.model);
  if (!def) throw new Error(w.key + " names a tool the catalog does not carry: " + w.model);
  const imgs = (def.imageParam && imageUrl) ? [imageUrl] : [];
  const body = rhVtBody(def, videoUrl, imgs, w.text ? w.text() : "", w.opts || {});
  return { key: w.key, apiPath: def.apiPath, needsImage: !!def.imageReq,
    takesImage: !!def.imageParam, maxSecs: w.maxSecs || null, art: w.art, body: body };
}

if (require.main === module) {
  const [sel, videoUrl, imageUrl] = process.argv.slice(2);
  if (sel === "keys") { process.stdout.write(WF.map(w => w.key).join("\n") + "\n"); process.exit(0); }
  if (!sel || !videoUrl) {
    console.error("usage: node tools/v2v_card_request.js <key|index> <videoUrl> [imageUrl]");
    process.exit(2);
  }
  process.stdout.write(JSON.stringify(request(sel, videoUrl, imageUrl)) + "\n");
}
module.exports = { request, card, WF, RH_VTOOL_MODELS, RH_VT_WH };
