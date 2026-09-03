/* ============================================================
   HNK AI Tools — Smart Workflow Registry (self-contained buttons)
   Spec §3 · §15 · §16/§28 + the "self-contained Smart Workflow Button" rule.

   Every workflow is a COMPLETE, self-contained action. It carries, in one
   place: a beginner explanation (shown on the first click), its required /
   optional image inputs with roles, its protected base instruction, and — for
   human-subject work — the full subject/identity/pose lock list and the shared
   negative-instruction set. There are NO separate global guards, locks or QC
   controls around the UI; the protection lives inside the button.

   `hiddenPrompt` (the base instruction) is kept for backward-compatibility and
   the mode-leak guarantee; `compile(id)` assembles the FULL protected prompt
   (base + reference-transfer rules + subject locks) plus the negative prompt.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

/* ---- Shared protection building blocks (baked into buttons, not the UI) ---- */

/* Full subject/identity/pose lock list for any human-subject workflow. */
var SUBJECT_LOCKS = [
  "keep the exact same person and facial identity",
  "preserve face geometry, eyes, eyelids, eyebrows, nose, lips and mouth shape, jawline and chin",
  "preserve the expression and gaze",
  "keep natural skin character and apparent age",
  "keep the hair, body proportions, pose, hands and legs",
  "keep the clothing and accessories",
  "keep the camera angle, subject scale, placement, crop and frame composition"
];

/* Comprehensive negatives every generation should avoid. */
var NEGATIVES = [
  "duplicate people", "extra people", "extra limbs", "broken or extra fingers",
  "distorted face", "unwanted face replacement", "plastic or waxy skin",
  "over-smoothing", "excessive blur", "unwanted logos", "unwanted text",
  "watermarks", "floating feet", "incorrect contact shadows", "mismatched perspective",
  "background colour cast on skin", "keeping people from the reference image"
];

/* Precise default reference-transfer behavior (spec: "reference transfer"). */
var REFERENCE_TRANSFER = [
  "Use the reference image for EVERYTHING except its people.",
  "Remove only the reference person or people.",
  "Keep the reference scene, environment, objects, props, architecture, foreground,",
  "background, lighting, colour, mood, effects, typography, logos, signs, layout and",
  "decorative content. Then place the ORIGINAL subject into that scene.",
  "Match lighting, perspective, depth, shadows, ground contact and environmental colour",
  "naturally so the subject sits believably in the scene."
].join(" ");

function _lockLine() { return "Subject lock: " + SUBJECT_LOCKS.join("; ") + "."; }

/* ---- Workflow definitions ----
   humanSubject: true  → subject locks + human negatives are appended.
   referenceTransfer: true → the reference-transfer rules are appended.
   explanation → shown on the first click (Click 1). */
var WORKFLOWS = [
  {
    id: "bg-replace", title: "BG Replace", home: true,
    visual: "icons/cards/bg-replace.jpg",
    summary: "Replace the background",
    explanation: "Replaces the background behind your subject. Your person, pose and edges stay exactly the same — the subject is relit naturally so it truly belongs in the new scene.",
    humanSubject: true, referenceTransfer: false,
    requiredInputs: [{ key: "subject", label: "Your Photo (Subject)", role: "subject" }],
    optionalInputs: [{ key: "background", label: "New Background (optional)", role: "background" }],
    negative: "duplicate people, extra people, extra limbs, broken or extra fingers, distorted face, unwanted face replacement, plastic or waxy skin, over-smoothing, excessive blur, unwanted logos, unwanted text, watermarks, floating feet, incorrect contact shadows, mismatched perspective, background colour cast on skin, keeping people from the reference image, changed pose, re-posed subject, different camera angle, changed camera distance or height, recropped image, reframed shot, zoomed in, zoomed out, shifted subject position in frame, altered composition",
    hiddenPrompt: "Replace only the background behind the subject; keep the subject's pose, edges, identity and composition unchanged. Relight the subject to match the new background's light direction, softness and colour temperature, and colour-grade the subject into the new scene's white balance — do not leave the original lighting untouched if it no longer matches the new environment. Match perspective, scale and camera height to the new background; add believable ground-contact shadows and correct depth-of-field falloff so the subject sits naturally in the scene rather than looking pasted on or cut out. Blend edges and hair seamlessly, with no visible cutout halo or edge fringing.\nSubject lock: keep the exact same person and facial identity; preserve face geometry, eyes, eyelids, eyebrows, nose, lips and mouth shape, jawline and chin; preserve the expression and gaze; keep natural skin character and apparent age; keep the hair, body proportions, pose, hands and legs; keep the clothing and accessories; keep the camera angle, subject scale, placement, crop and frame composition. COMPOSITION LOCK: do not re-pose, re-angle the camera, zoom, recrop or reinterpret the shot in any way — the subject's exact position, scale and pose within the frame must match the source photo pixel-for-pixel wherever this task does not explicitly require a change.",
    route: { modelId: "nano-banana-2", auto: true }
  },
  {
    id: "reference-transfer", title: "Reference Transfer", home: true,
    visual: "icons/cards/reference-transfer.jpg",
    summary: "Put your subject into a reference scene",
    explanation: "Takes a reference photo's whole scene (but NOT the people in it) and places YOUR subject into it — keeping your subject's identity, pose and framing, and matching the scene's light and perspective.",
    humanSubject: true, referenceTransfer: true,
    requiredInputs: [
      { key: "subject", label: "Your Photo (Subject)", role: "subject" },
      { key: "scene", label: "Reference Scene", role: "background" }
    ],
    optionalInputs: [{ key: "style", label: "Style Reference (optional)", role: "style" }],
    hiddenPrompt: "Transfer the reference scene onto the original subject.",
    route: { modelId: "nano-banana-2", auto: true }
  },
  {
    id: "master-bgfg-replace", title: "Master BG FG Replace", home: true,
    visual: "icons/cards/master-bgfg-replace.jpg",
    summary: "Remove the scene's person, rebuild bg/fg, insert your subject",
    explanation: "The strictest subject-in-scene replacement: completely removes the person from your reference scene, naturally reconstructs the hidden background and foreground, then places your exact subject into that spot — identity, pose, proportions, hairstyle, outfit, skin and lighting locked from your photo, while the reference supplies only the scene, camera and depth.",
    humanSubject: true, referenceTransfer: true,
    requiredInputs: [
      { key: "subject", label: "Your Photo (Subject)", role: "subject" },
      { key: "scene", label: "Target Scene with Person", role: "background" }
    ],
    optionalInputs: [],
    bespoke: true,
    negative: "change identity, different person, beautified facial structure, changed eyes, changed nose, changed lips, changed jaw, changed expression, changed age, changed ethnicity, changed hairstyle, changed outfit, changed body shape, changed body proportions, changed pose, copying IMAGE 2 person's pose, copying IMAGE 2 person's skin, copying IMAGE 2 person's face, copying IMAGE 2 person's clothes, replaced IMAGE 1 skin tone, relit face, over-retouched skin, plastic skin, wax skin, excessive smoothing, skin color contamination, distorted anatomy, malformed hands, extra fingers, missing fingers, duplicate limbs, extra arms, extra legs, duplicate subject, ghost person, residual person from IMAGE 2, floating body, incorrect ground contact, perspective mismatch, unrealistic scale, stretched body, oversized head, undersized head, cutout edges, halo, blurry hair edges, random objects, unwanted text, unwanted logo, watermark, scene redesign, background replacement beyond removal and reconstruction of the original IMAGE 2 person",
    hiddenPrompt: "Use the exact original subject from IMAGE 1. Completely remove the person or people appearing in IMAGE 2, reconstruct the hidden background and foreground naturally after the removal, then place the exact subject from IMAGE 1 into the exact location the removed person occupied in IMAGE 2. The final result must look like the IMAGE 1 subject was genuinely photographed inside the IMAGE 2 environment.\nIDENTITY LOCK (highest priority, IMAGE 1 wins any conflict): preserve the exact facial identity, face shape, eyes, eyelids, eyebrows, eye spacing, nose, nostril shape, lips, mouth shape, cheeks, jawline, chin, forehead, ears, skin character, natural pores, skin texture, skin tone, skin undertone, age appearance, ethnicity, expression and gaze direction from IMAGE 1. Do not redesign, reinterpret, beautify, regenerate, reshape or replace the subject. Preserve the exact hairstyle (shape, length, hairline, volume, direction, loose strands), the exact body (proportions, shoulder shape, arm proportions, hand structure, fingers, waist, hips, legs, feet) and the exact outfit (clothing, fabric, embroidery, patterns, accessories, jewelry, shoes, veil, headwear) — no wardrobe redesign.\nPOSE LOCK: keep the IMAGE 1 subject's pose unchanged — head angle, neck angle, shoulder direction, torso rotation, arm position, hand position, finger arrangement, hip direction, leg position, feet position, sitting/standing/kneeling configuration and body gesture all stay exactly as in IMAGE 1. Do not copy the IMAGE 2 person's pose. The IMAGE 2 person is used only as a target location / environmental occupancy reference, never as an identity or pose source.\nPROPORTION LOCK: preserve IMAGE 1's natural body ratio, head-to-body ratio, face-to-body ratio and anatomical scale. Never stretch, squash, widen, slim, shorten or enlarge the head or body — only uniform resizing and repositioning is allowed to fit the target location in IMAGE 2, no non-proportional transformation.\nSKIN LOCK: use IMAGE 1 as the exclusive source for skin tone, undertone, pores, micro texture, retouch level, softness and luminosity. Do not copy the IMAGE 2 person's skin color or processing, and do not let IMAGE 2's environment color excessively contaminate the subject's skin — no orange/green/blue/magenta cast, no gray skin, no artificial whitening, no plastic skin.\nLIGHTING LOCK: keep IMAGE 1's facial lighting, skin highlight structure, shadow structure, light direction, softness, contrast, exposure, white balance, highlight roll-off and skin luminosity as the primary lighting on the subject. IMAGE 2 lighting may only inform subtle, physically believable environmental integration — never replace or destroy IMAGE 1's original facial light pattern.\nPERSON REMOVAL: remove the original person or people from IMAGE 2 completely — face, hair, body, arms, hands, legs, clothing, shoes, and any shadows or reflections belonging uniquely to them. Leave no ghost body, duplicate limbs, leftover clothing, skin fragments, silhouette, halo or old shadow artifacts. Reconstruct every area that was hidden behind the removed person so it matches IMAGE 2 naturally.\nSCENE PURITY: preserve all non-human scene information from IMAGE 2 — background, foreground, architecture, furniture, landscape, vegetation, floor, walls, sky, water, props, decorations, environmental objects, depth, perspective, camera viewpoint, lens feeling, depth of field, bokeh, scene color, atmosphere and mood. Do not redesign the background or remove objects unless they physically conflict with the new subject's placement.\nPLACEMENT: use the removed IMAGE 2 person only to estimate target position, ground location, scene depth, occupancy zone and interaction plane — never their face, body, clothing, pose, skin or identity. Place the IMAGE 1 subject naturally inside that zone while keeping the IMAGE 1 pose intact, with correct ground/chair/sofa/floor contact, scale, depth and perspective — no floating, no sinking, no disconnected feet, no impossible body contact.\nSHADOW & EDGE INTEGRATION: add or reconstruct only the environmental contact information needed for realism — contact shadows, foot shadows, chair shadows, subtle ambient occlusion, and reflections if physically required — matching IMAGE 2's geometry while staying consistent with the preserved IMAGE 1 subject lighting; do not repaint or significantly relight the subject. Create professional masking around hair, veil, fingers, transparent fabric, lace and jewelry edges — no cutout look, no hard halo, no blurry edges, no missing hair, no excessive edge glow.\nDEPTH & OCCLUSION: respect IMAGE 2's scene depth — foreground objects that naturally belong in front of the target position must occlude the inserted subject correctly, and objects the subject should appear behind must stay in front, preserving correct front/back relationships, perspective and focus transition.\nQUALITY: keep the subject highly realistic and photographic — natural facial detail, natural skin texture, realistic hair, clothing, hands, anatomy and scene texture, high-frequency detail. No AI illustration look, no CGI look, no wax skin, no fake HDR, no oversharpening.\nFINAL COMMAND: remove the person from IMAGE 2 first, reconstruct the empty scene naturally, then insert the exact original subject from IMAGE 1 into that person's location — identity, face, pose, body proportions, hair, outfit, skin and subject lighting unchanged. Use IMAGE 2 only for scene, camera viewpoint, perspective, depth, environment and target position. Create a seamless, photorealistic, physically believable final photograph with zero visible AI or compositing artifacts.",
    route: { modelId: "nano-banana-2", auto: true }
  },
  {
    id: "subject-face", title: "Subject / Face", home: true,
    visual: "icons/cards/subject-face.jpg",
    summary: "Transfer a subject or face onto a base",
    explanation: "Blends a referenced subject or face onto your base image seamlessly, keeping the base composition intact.",
    humanSubject: true, referenceTransfer: false,
    requiredInputs: [
      { key: "base", label: "Base Image", role: "main" },
      { key: "face", label: "Face / Subject Reference", role: "face" }
    ],
    optionalInputs: [],
    bespoke: true,
    negative: "duplicate people, extra people, extra limbs, broken or extra fingers, distorted face, plastic or waxy skin, over-smoothing, excessive blur, unwanted logos, unwanted text, watermarks, floating feet, incorrect contact shadows, mismatched perspective, background colour cast on skin",
    hiddenPrompt: "SUBJECT / FACE TRANSFER: replace the person (or, if only the face is requested, just the face) in the base IMAGE 1 with the subject/face from IMAGE 2 — the FINAL identity comes from IMAGE 2: same eyes, eyebrows, nose, lips, bone structure, skin tone and unique features. Determine scope from the task: a FACE-ONLY request transfers identity alone; a FULL SUBJECT request transfers the whole person including body and hair.\nFACE-ONLY MODE — PRESERVE from IMAGE 1: the scene, background, framing, camera angle, body position and scale, clothing, hairstyle (keep IMAGE 1's original hair completely unchanged) and original head angle, gaze direction and expression; only the facial identity itself changes.\nFULL SUBJECT MODE — PRESERVE from IMAGE 1: the scene, background, framing, camera angle and lighting direction/colour grade; the body pose, hairstyle and clothing come from IMAGE 2 along with the identity.\nRelight the transferred subject/face to match IMAGE 1's scene perfectly, with seamless invisible blending at the hairline, jaw and neck — no halo, no cutout look, real skin texture. The result must read as one untouched professional photograph.",
    route: { modelId: "nano-banana-2", auto: true }
  },
  {
    id: "retouch", title: "AI Retouch", home: true,
    visual: "icons/cards/retouch.jpg",
    summary: "Natural portrait enhancement",
    explanation: "Gives a natural retouch to skin, hair and tone. Your identity, features and expression are kept — no plastic skin, no face change.",
    humanSubject: true, referenceTransfer: false,
    requiredInputs: [{ key: "portrait", label: "Portrait", role: "main" }],
    optionalInputs: [],
    hiddenPrompt: "Apply a natural, subtle portrait retouch to skin, hair and tone — on ALL visible skin alike: face, neck, chest, shoulders, arms and hands finished to one consistent texture and tone, the body matching the face with no boundary at the jawline. Keep the person's identity, features, expression, pose, framing and composition exactly; keep real pore texture — never plastic or waxy skin.",
    route: { modelId: "qwen-image-2-pro", auto: true }
  },
  {
    id: "upscale", title: "AI Upscale", home: true,
    visual: "icons/cards/upscale.jpg",
    summary: "Detail-preserving upscale",
    explanation: "Upscales your image while restoring fine natural detail in skin, hair and fabric. Identity, pose, composition and colors stay exactly the same — no plastic smoothing.",
    humanSubject: true, referenceTransfer: false,
    requiredInputs: [{ key: "image", label: "Image", role: "main" }],
    optionalInputs: [],
    hiddenPrompt: "Upscale the image, restoring fine natural detail in skin, hair and fabric. Keep identity, pose, composition and colors exactly; do not smooth skin into a plastic look.",
    route: { modelId: "upscale-pro", auto: true }
  },
  {
    id: "object-edit", title: "Object Edit", home: true,
    visual: "icons/cards/object-edit.jpg",
    summary: "Remove, replace or add objects",
    explanation: "Removes, replaces or adds objects using a controlled local edit. Everything you don't touch stays the same.",
    humanSubject: false, referenceTransfer: false,
    requiredInputs: [{ key: "image", label: "Image", role: "main" }],
    optionalInputs: [{ key: "reference", label: "Object Reference (optional)", role: "product" }],
    negative: "duplicate people, extra people, extra limbs, broken or extra fingers, distorted face, unwanted face replacement, plastic or waxy skin, over-smoothing, excessive blur, unwanted logos, unwanted text, watermarks, floating feet, incorrect contact shadows, mismatched perspective, background colour cast on skin, keeping people from the reference image, changed pose, re-posed subject, different camera angle, changed camera distance or height, recropped image, reframed shot, zoomed in, zoomed out, shifted subject position in frame, altered composition",
    hiddenPrompt: "Perform the requested local object edit only, confined strictly to the named object's boundaries. Keep every other pixel \u2014 background, subject, other objects \u2014 unchanged and preserve untouched regions exactly, with no bleeding of the edit into surrounding areas. Match the edited object's lighting direction, shadow, colour temperature, texture and perspective to the rest of the scene so it reads as originally photographed, not pasted in. If the object is near or overlapping the subject, do not alter the subject's face, identity, expression, pose or any other feature outside the requested edit. COMPOSITION LOCK: do not re-pose, re-angle the camera, zoom, recrop or reinterpret the shot in any way \u2014 the subject's exact position, scale and pose within the frame must match the source photo pixel-for-pixel wherever this task does not explicitly require a change.",
    route: { modelId: "qwen-image-2-pro", auto: true }
  },
  {
    id: "water-edit", title: "Water Edit", home: false,
    visual: "icons/cards/water-edit.jpg",
    summary: "Water and reflection edits",
    explanation: "Adds or edits water, reflections and wet surfaces so they look physically natural, keeping your subject intact.",
    humanSubject: false, referenceTransfer: false,
    requiredInputs: [{ key: "image", label: "Image", role: "main" }],
    optionalInputs: [],
    hiddenPrompt: "Edit water, reflections and wet surfaces naturally and physically plausibly; keep the subject unchanged.",
    route: { modelId: "wan-image-edit", auto: true }
  },
  {
    id: "text-logo", title: "Text / Logo", home: false,
    visual: "icons/cards/text-logo.jpg",
    summary: "Add or edit text and logos",
    explanation: "Adds or edits clean, legible text or a logo on the image while keeping the composition.",
    humanSubject: false, referenceTransfer: false,
    requiredInputs: [{ key: "image", label: "Image", role: "main" }],
    optionalInputs: [{ key: "logo", label: "Logo Reference (optional)", role: "text" }],
    negative: "illegible text, warped or garbled lettering, misspelled words, garish or cartoonish font, wrong font substitution, redesigned or restyled logo mark, incorrect logo proportions or colours, text or logo covering the face, unwanted extra logos, unwanted extra text, watermark-style repeated text, mismatched perspective or scale, floating or misaligned typography, changed pose, changed identity, changed clothing, altered composition",
    hiddenPrompt: "Add or edit the requested text/logo. If a reference graphic is supplied, reproduce its exact lettering, shapes, font style, proportions and colours faithfully \u2014 do not redesign, restyle or substitute a different font or mark. Render clean, crisp, fully legible typography at correct perspective and scale for its placement surface, with natural shadow/highlight integration so it reads as part of the photo. Place it tastefully at a balanced size that never covers or overlaps the subject's face. Keep the rest of the composition, subject and identity unchanged. COMPOSITION LOCK: do not re-pose, re-angle the camera, zoom, recrop or reinterpret the shot in any way \u2014 the subject's exact position, scale and pose within the frame must match the source photo pixel-for-pixel wherever this task does not explicitly require a change.",
    /* v6.27.0 \u2014 was gpt-image-2, whose RunningHub endpoint is still an
       intentionally-empty placeholder in runninghub-config, so this
       workflow could never generate. Routed to the same confirmed edit
       deployment the sibling identity-edit workflows run on. */
    route: { modelId: "nano-banana-2", auto: true }
  }
];

var _byId = {};
for (var i = 0; i < WORKFLOWS.length; i++) _byId[WORKFLOWS[i].id] = WORKFLOWS[i];

/* v6.27.0 — the web app's FULL Smart Workflow catalog (all 131, owner
   request). The nine hand-built definitions above stay authoritative for
   their ids and gain their app category; every other catalog item is
   wrapped into the same registry shape: the app's own prompt rides as a
   complete bespoke instruction (compile() appends nothing to bespoke
   prompts), the app's negative and input labels come along, and routing
   uses the same confirmed nano-banana-2 edit deployment as the app's
   tier. Card art for wrapped items loads from the licensed web host the
   manifest already allows (the same host the Visual Library reads);
   offline the card falls back to text. Data: js/hnk_wf_catalog_data.js —
   GENERATED from the app and pinned to it by
   test/verify_panel_wf_catalog_sync.js. */
var _CATALOG = (typeof module !== "undefined" && module.exports)
  ? (function () { try { return require("../../js/hnk_wf_catalog_data.js"); } catch (e) { return null; } })()
  : ((typeof globalThis !== "undefined" && globalThis.HNK) ? globalThis.HNK.WF_CATALOG : null);
var _CATEGORIES = [];
var _ART_BASE = "https://hnk-ai-tools-3-s4nnu.ondigitalocean.app/app/lib/wf/cards5/";
if (_CATALOG && _CATALOG.categories) {
  _CATALOG.categories.forEach(function (c) {
    var ids = [];
    c.items.forEach(function (w) {
      ids.push(w.id);
      if (_byId[w.id]) {
        var own = _byId[w.id];
        if (!own.category) own.category = c.category;
        /* v6.51.0 — the app's card badge / wedding sub-group ride along for
           the hand-built definitions too, so the list draws them the same */
        if (!own.badge) own.badge = w.badge || "";
        if (!own.wedGroup) own.wedGroup = w.wedGroup || "";
        /* the app's own card line for this id; `summary` stays the English
           wizard fallback the wf_sum_* translations key off */
        if (!own.cardSummary) own.cardSummary = w.summary || "";
        return;
      }
      var wf = {
        id: w.id, title: w.title, home: false, category: c.category,
        /* v6.58.0 — the app publishes a card photograph for a workflow only
           once one has been made (its NO_CARD_JPG list is exactly that
           mechanism), and the generated catalog carries the answer as
           hasCard. This line used to build the URL from the id regardless,
           so a workflow that shipped ahead of its photograph asked the web
           app's host for a file that is not there: a silent 404 on every
           render, and a black tile with no fallback. Honour hasCard and the
           card falls back to wfv-noart, exactly as the app's grid does. */
        visual: w.hasCard ? (_ART_BASE + w.id + ".jpg") : "",
        badge: w.badge || "", wedGroup: w.wedGroup || "",
        summary: w.summary, explanation: w.explanation,
        humanSubject: false, referenceTransfer: false, bespoke: true,
        requiredInputs: (w.req || []).map(function (label, ri) {
          return { key: "img" + (ri + 1), label: label, role: ri === 0 ? "main" : "reference" };
        }),
        optionalInputs: (w.opt || []).map(function (label, oi) {
          return { key: "opt" + (oi + 1), label: label, role: "reference" };
        }),
        negative: w.negative,
        fields: w.fields || [],
        region: w.id === "region-edit",
        hiddenPrompt: w.prompt,
        route: { modelId: "nano-banana-2", auto: true }
      };
      WORKFLOWS.push(wf);
      _byId[wf.id] = wf;
    });
    _CATEGORIES.push({ category: c.category, icon: c.icon || "", desc: c.desc || "", open: !!c.open, ids: ids });
  });
}

function list() { return WORKFLOWS.slice(); }
function homeList() { return WORKFLOWS.filter(function (w) { return w.home; }); }
function get(id) { return _byId[id] || null; }
function categories() { return _CATEGORIES.slice(); }

/* Assemble the FULL protected prompt + negatives for a workflow. This is what
   goes to the provider — self-contained, no external guard needed. */
/* v6.35.0 — per-workflow design fields (concept-poster): byte-identical
   assembly logic to the web app's applyWfFields. A toggle OFF removes the
   prompt line that starts with its tag; a text field fills its token or
   removes its tagged line when empty; a colour field fills its token with
   "#hex (colour name)". The canonical prompt in the catalog stays the
   all-ON version, so the sync test keeps pinning app and panel together. */
function colourName(hex) {
  var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim()); if (!m) return "deep colour";
  var n = parseInt(m[1], 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  var sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (l < 0.08) return "near-black";
  if (l > 0.93) return "near-white";
  if (sat < 0.12) return l < 0.5 ? "charcoal grey" : "soft grey";
  var h = 0;
  if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  var name = h < 15 ? "red" : h < 40 ? (l < 0.4 ? "brown" : "warm orange") : h < 65 ? "golden yellow" : h < 150 ? (l < 0.35 ? "forest green" : "green") : h < 190 ? "teal" : h < 250 ? (l < 0.35 ? "navy blue" : "blue") : h < 290 ? "violet" : h < 330 ? "magenta" : "crimson";
  return (l < 0.3 ? "deep " : l > 0.75 ? "light " : "") + name;
}
function applyFields(prompt, fields, vals) {
  var p = prompt;
  (fields || []).forEach(function (f) {
    var v = vals ? vals[f.key] : undefined;
    if (f.type === "toggle") {
      var on = (v === undefined) ? (f.default !== false) : !!v;
      /* v6.63.0 — a field with an `off` line puts it in the tagged line's
         place (the app's applyWfFields, byte for byte); without one the line
         is removed as before. */
      if (!on && f.tag) p = p.split("\n").map(function (ln) { return ln.indexOf(f.tag) !== 0 ? ln : (f.off || null); }).filter(function (ln) { return ln !== null; }).join("\n");
    } else if (f.type === "text") {
      var tv = String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, f.max || 80);
      if (!tv && f.tag) p = p.split("\n").filter(function (ln) { return ln.indexOf(f.tag) !== 0; }).join("\n");
      else if (tv && f.token) p = p.split(f.token).join(tv);
    } else if (f.type === "color") {
      var cv = String(v || f.default || "#123B2F");
      if (f.token) p = p.split(f.token).join(cv + " (" + colourName(cv) + ")");
    }
  });
  return p;
}
function compile(id, fieldVals) {
  var wf = _byId[id];
  if (!wf) return null;
  var base = (wf.fields && wf.fields.length) ? applyFields(wf.hiddenPrompt, wf.fields, fieldVals) : wf.hiddenPrompt;
  var parts = [base];
  var rules = [];
  /* bespoke: the hiddenPrompt is a complete, self-resolving instruction
     (ported from the web app) — appending the generic reference-transfer or
     subject-lock lines would reintroduce the contradictions it resolves
     (e.g. subject-face: "transfer the face" + "keep the exact same facial
     identity"). The flags stay as metadata for rules/telemetry. */
  if (wf.referenceTransfer) { if (!wf.bespoke) parts.push(REFERENCE_TRANSFER); rules.push("exclude-reference-people", "keep-reference-scene"); }
  if (wf.humanSubject) { if (!wf.bespoke) parts.push(_lockLine()); rules.push("preserve-subject-identity", "preserve-pose-composition"); }
  rules.push("preserve-untouched-regions", "avoid-artifacts");
  return {
    prompt: parts.join("\n"),
    negativePrompt: wf.negative || NEGATIVES.join(", "),
    rules: rules,
    humanSubject: !!wf.humanSubject,
    referenceTransfer: !!wf.referenceTransfer
  };
}

/* i18n key derivation (pure). Workflow TITLES stay English — they are the
   feature names users learn and search for — but the human-facing summary and
   the per-slot input labels are translated through the shared dictionary. */
function summaryKey(workflowId) {
  return "wf_sum_" + String(workflowId || "").replace(/-/g, "_");
}
function explanationKey(workflowId) {
  return "wf_exp_" + String(workflowId || "").replace(/-/g, "_");
}
var INPUT_LABEL_KEYS = {
  "Your Photo (Subject)": "wfin_subject",
  "New Background (optional)": "wfin_new_bg",
  "Reference Scene": "wfin_ref_scene",
  "Style Reference (optional)": "wfin_style_ref",
  "Target Scene with Person": "wfin_target_scene",
  "Base Image": "wfin_base",
  "Face / Subject Reference": "wfin_face_ref",
  "Portrait": "wfin_portrait",
  "Image": "wfin_image",
  "Object Reference (optional)": "wfin_object_ref",
  "Logo Reference (optional)": "wfin_logo_ref"
};
function inputLabelKey(label) { return INPUT_LABEL_KEYS[String(label || "")] || null; }

var API = {
  list: list, homeList: homeList, get: get, categories: categories, compile: compile,
  applyFields: applyFields, colourName: colourName,
  summaryKey: summaryKey, explanationKey: explanationKey,
  inputLabelKey: inputLabelKey, INPUT_LABEL_KEYS: INPUT_LABEL_KEYS,
  SUBJECT_LOCKS: SUBJECT_LOCKS, NEGATIVES: NEGATIVES, REFERENCE_TRANSFER: REFERENCE_TRANSFER
};

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.workflowRegistry = API; }
})();
