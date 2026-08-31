# Photoshop panel release and security runbook

This repository is public. A directory called `private`, a GitHub Release, or
Git LFS does not make a committed installer private. No CCX file may be added
to Git, and no static page may contain a permanent installer URL.

## Security boundary

- The official panel fails closed and asks the unified API to validate the
  account, approval/status, active license, panel permission, shared computer
  slot, session, and minimum supported version. A copied but unmodified panel
  therefore remains locked without a valid account and registered computer.
- A CCX is inspectable client-side JavaScript. A determined user can patch out
  client checks, and the current installation identifier is not hardware
  attestation. This is casual-copy control, not DRM. Stronger enforcement would
  require sensitive operations to pass through a short-lived server capability
  or HNK proxy; direct BYOK provider calls cannot make the client unpatchable.
- Never place an admin key, database/service credential, JWT signing secret,
  private object-store credential, or student password in panel source or an
  installer.

## Tracked and untracked material

Tracked:

- reviewed redistributable panel source;
- `panel/release-manifest.json` (version, minimum version, expected filename,
  SHA-256, and byte size only);
- packaging, validation, and delivery code.

Never tracked:

- `*.ccx`, temporary ZIP output, or a local `server/private/` directory;
- extracted image libraries until ownership, redistribution rights, and any
  required model/guardian consent are recorded;
- object-store credentials or local Adobe packaging state.

`node test/verify_no_public_ccx.js` uses `git ls-files`, so an ignored local
artifact is allowed while a committed binary or Git LFS pointer fails the gate.
Deleting a file in a later commit does not remove it from earlier Git history.

## Build outside the repository

Create a private temporary directory, pass the complete absolute output path,
then verify the exact untracked artifact:

```bash
release_dir="$(mktemp -d)"
artifact="$release_dir/HNK_Ai_Panel_v6.25.0.ccx"
panel/package.sh "$artifact"
HNK_PANEL_ARTIFACT="$artifact" node test/verify_ccx_package.js
HNK_PANEL_ARTIFACT="$artifact" node test/verify_release_contract.js
sha256sum "$artifact"
```

The output directory must already exist and resolve outside this repository.
`panel/package.sh` writes into a unique directory on the destination filesystem,
validates the ZIP, sets mode `0600`, and atomically renames it into place. An
interrupted `zip` therefore cannot replace the last complete artifact or leave
its scratch file in the repository.

Before changing `panel/release-manifest.json`, reproduce the artifact from the
reviewed source and copy the measured SHA-256 and byte count. Do not use
`git add -f` to bypass the ignore rule.

## Private storage and delivery

Production target: a private DigitalOcean Space with immutable,
content-addressed object keys. Use separate credentials: an upload-only release
credential and a runtime read credential. The API must atomically consume the
five-minute, one-time download token, re-check the live session/entitlement,
computer slot, and enabled release, and then stream the private object. Do not
redirect to a presigned object URL when strict one-time redemption is required;
that URL can be replayed until it expires.

The guarded `setup-spaces.yml` lane (typed confirmation SPACES) builds this
target without console work: an account-scoped private bucket created with an
ephemeral fullaccess key that is deleted on every exit path, a rotated
read-only runtime key written into the live spec as SPACES_* (pinned by
`test/verify_spaces_secrets_patch.js`), and `/api/health` reporting
`artifactStore: "spaces"` before the lane may finish. The release lane then
mirrors each rebuilt artifact to the content-addressed key
`ccx/<sha256>/<artifact-file>` with a per-run ephemeral readwrite credential,
verifies the round trip byte-for-byte, and records the object on the release
row; the serving path re-verifies SHA-256/size on every materialization
(`test/verify_spaces_artifact_path.js`).

The PostgreSQL chunk store — immutable metadata plus fixed-size (for example
4 MiB) binary chunks, SHA-256/size verified on finalization — remains the
delivery bridge and the always-on fallback: a Space outage degrades to the
bridge, never to an unverified byte. Do not launch paid student delivery
until the backing data is on a managed/backup-capable store.

## Legacy v6.23.0 cutoff

The previously published v6.23.0 blob remains obtainable from public Git
history and contains a seven-day offline grace path against the retired
Supabase account system. Deleting the current-tree file cannot revoke it.

1. Keep the legacy authorization service reachable and make it return an
   explicit non-entitled result for every account. Do not simply turn the host
   off: a network failure activates the legacy offline path.
2. Record the denial start time and wait at least seven full days. An honest
   installation that cached a success immediately before denial can continue
   until the earlier of its cached plan expiry or that seven-day limit.
3. After the cutoff, confirm legacy login/entitlement requests still deny, then
   retire the host if no other dependency uses it.
4. Treat patched legacy JavaScript and clock/device spoofing as outside this
   casual-copy control; only server-owned capabilities can close that class of
   bypass.

## Adobe acceptance gate

A reproducible ZIP test is not Adobe acceptance. Before enabling a release:

1. package/test the reviewed source with Adobe UXP Developer Tool;
2. install and launch it in every supported Photoshop/OS combination;
3. verify login, direct device registration, online failure, update-required behavior,
   provider operation, logout, and reinstall;
4. record the UXP Developer Tool version, Photoshop/OS versions, artifact hash,
   date, and tester;
5. keep `adobe_acceptance` as `pending` and the server release disabled until
   those results pass.

Only after repository checks, artifact verification, private upload, Adobe
acceptance, and server-side release enablement may the download be exposed to
eligible students.

## Acceptance record

- **v6.25.2** — accepted 2026-08-28. Tester: the owner, in real Photoshop on
  Windows (Creative Cloud CCX install; the div-button gate build). Artifact
  `HNK_Ai_Panel_v6.25.2.ccx`, SHA-256
  `423eed7920db2abc684b86066567d546a170c57ef94694498624228002da53ba`,
  529,773 bytes. Verified in-app: install and launch, sign-in, computer
  pairing, the update-required deny clearing after server-side release
  enablement, Visual Library art loading from the deployed /app/lib tree,
  and provider tool operation. v6.25.3 (catalog-only data change over the
  same code) stays `pending` until the owner confirms it in Photoshop the
  same way.
- **v6.26.0** — superseded by v6.26.1 before acceptance completed. The
  RunningHub-only conversion (owner decision, mirrors web app 5.50.0): the
  Gemini and OpenAI engines, the Gemini text bridge and both providers'
  network domains removed; every generation routes through the AI Tools
  RunningHub adapter stack. The owner's in-Photoshop test reached the
  expected pre-publish deny and the post-publish re-check; mid-check the
  gate card looked like a broken half-empty dialog, which produced the
  v6.26.1 gate redesign below. Artifact `HNK_Ai_Panel_v6.26.0.ccx`, SHA-256
  `f6d9f8cfebf11e0a131ab0269832e6b59adcfa90544d6d3a2c46b02d5406b3e0`,
  523,178 bytes.
- **v6.26.1** — superseded by v6.26.2 before acceptance completed. Added
  the always-visible gate card (owner request): every gate input and
  button paints in every state; state changes only the message strings
  and busy dimming. Artifact `HNK_Ai_Panel_v6.26.1.ccx`, SHA-256
  `71785a0b45e52b3d96fe8a5792a251770970bb83365de7f285173f0909ce14e2`,
  523,600 bytes.
- **v6.26.2** — superseded by v6.27.0 before acceptance completed. During a
  browser render of the tracked panel source for fresh website screenshots,
  the AI Tools tab failed to start with `applyDefaultsTo is not defined`:
  the v6.26.0 OpenAI removal deleted the provider-neutral
  `applyDefaultsTo` helper beside the removed key block while
  settings-service's return object (and the AI Tools bootstrap) still
  referenced it, so `create()` threw and the AI Tools tab was broken in
  6.26.0 through 6.26.2. Was: v6.26.1 plus web-app UI/UX parity for the member
  identity (owner request): the gate's HNK square shows the member's own
  profile photo — fetched from their profiles row after session refresh,
  bounded exactly like the web app (jpeg/png/webp data URL ≤ 96 KB),
  cached in settings with the same bound re-checked on load, and cleared
  on sign-out. The panel only displays the photo; changing it stays on
  the website. Real-Photoshop acceptance MUST cover the full v6.26.0
  engine checklist — RunningHub key save + verify in Setup, a Studio
  generate (fast and quality tiers), a preset and a Retouch run, a
  Create-tab generation, an AI Tools generate, a legacy-settings launch
  (a 6.25.x settings file with a stored Gemini key must open cleanly with
  the key purged) — plus the v6.26.1 full-card gate states and the new
  photo behavior (photo appears after sign-in for an account that has
  one; HNK mark for one that does not; photo gone after sign-out).
  Artifact `HNK_Ai_Panel_v6.26.2.ccx`, SHA-256
  `4613c12a32aaae363fe9b04e367c0f180defeaf6e2dcf4bda9ef86edf2064949`,
  524,577 bytes.
- **v6.37.0** — `pending`. The Design Series wave (2026-08-31, owner: nine
  reference sets — "this exact design, any photo, a hundred photos come
  back identical"). Eight new Smart Workflows in Studio Scenes (ink-atelier,
  doll-boudoir, gold-chrysanth, lion-dance, lotus-dance, lotus-garden,
  saigon-glam, peony-night) each carry the full ten-field design panel, and
  Derma Skin Pro joins Face & Portrait — a dermatologist-grade face-and-body
  retouch with five ON/OFF switches (blemish healing, tone evening, body
  skin, eyes & teeth, shine control) that heals what is temporary while
  keeping true pore texture. The design panels carry:
  an optional caption box hand-lettered into the artwork, a backdrop colour
  picker with six curated swatches, free-text backdrop and props request
  boxes that vanish from the prompt when empty, and six ON/OFF switches
  (skin beauty, colour tone, hair, dress, retouch, liquify) compiled with
  byte-identical logic on both surfaces. Catalog total moves 133 → 142 (sync
  tests green); the per-workflow results board covers all eight
  automatically. Acceptance: carry over the v6.36.0 checklist; additionally
  open two of the eight (one light series, one dark series) in real
  Photoshop, confirm the ten design controls render, run one pass each with
  a custom caption and one switch OFF, and confirm the result returns in the
  series' design with the caption rendered letter-for-letter and the
  switched-off enhancement absent. Artifact `HNK_Ai_Panel_v6.37.0.ccx`,
  SHA-256
  `56cd16d3db071f2e3d89239efc112341380a712db58490304c4db011a56d7951`,
  1,309,020 bytes. Stays disabled for customers until this acceptance.
- **v6.36.0** — `pending`. The Selection Edit wave (2026-08-31, owner: a
  Rectangle-tool selection plus a typed request must change ONLY the
  selected region — identical pixels outside, same white balance). One new
  Smart Workflow (region-edit, Repair & Enhance) that exists mechanically,
  not just by prompt: at Generate the panel reads the live rectangular
  selection bounds (batchPlay), captures exactly those composite pixels
  (imaging.getPixels sourceBounds) as the request image, and on return
  places the result at the same exact bounds with a layer mask cut from a
  re-made rectangle selection — pixels outside the marquee are untouched
  by construction, and the prompt additionally locks white balance,
  exposure, grain and edge continuity. The request box is a required
  design field: Generate refuses politely without typed text or without a
  live selection. Catalog total moves 132 → 133 on both surfaces (sync
  tests green). Acceptance: carry over the v6.35.0 checklist;
  additionally, in real Photoshop make a Rectangle-tool selection over an
  object, type a change (e.g. "make the white flower red"), Generate, and
  confirm the result returns as a masked layer whose mask matches the
  marquee exactly, with every pixel outside the selection identical to
  the original document and no seam or white-balance shift at the edges;
  also confirm Generate is blocked with the guidance message when no
  selection exists and when the request box is empty. Artifact
  `HNK_Ai_Panel_v6.36.0.ccx`, SHA-256
  `b5deb939b24ada9b4211b4cbc1d883a29dcacd9a4e8a95eac8865806fe1ff32f`,
  1,298,496 bytes. Stays disabled for customers until this acceptance.
- **v6.35.0** — `pending`. The Concept Art Poster wave (2026-08-31, owner:
  the two reference videos — heritage art poster design + the DP-CONCEPT
  results grid). One new Smart Workflow (concept-poster, Studio Scenes)
  with per-run design fields riding the shared catalog: a free poster-text
  box, a backdrop colour picker, and ON/OFF switches for skin beauty,
  colour tone, hair, dress, liquify and the gold folk-art layer — the
  panel compiles them into the prompt with byte-identical logic to the
  web app, so both surfaces produce the same request. Also: the seven
  LEARN-DESIGN palette themes on the theme wheel, and the catalog total
  moves 131 → 132 (sync tests green). Acceptance: carry over the v6.34.0
  checklist; additionally open Concept Art Poster in real Photoshop,
  confirm the six switches, text box and colour swatches render, run one
  pass with custom text and confirm the poster returns with that exact
  text; step the theme wheel through all nine stops and confirm every
  screen stays readable. Artifact `HNK_Ai_Panel_v6.35.0.ccx`, SHA-256
  `4c3d46e0b4cbb2851136c3628adb203870dc027d4b73474c908d568b1decdb8a`,
  1,295,434 bytes. Stays disabled for customers until this acceptance.
- **v6.34.0** — `pending`. The glam retouch wave (2026-08-31, owner:
  Retouch တွေကို လက်ရှိထက် ၁၀ ဆမက ပိုချောအောင် — Vietnam/China studio
  glass-skin standard). The four retouch-family workflow prompts
  (retouch, master-pro-retouch, pr-meitu "Retouch A Style", pr-evoto
  "Retouch B Style") move from the conservative natural finish to the
  Vietnamese/Chinese beauty-studio standard — flawless porcelain glass
  skin, milky even tone, firm lifted glow — at full strength; identity,
  composition and apparent-age locks stay word-for-word. Catalog data is
  regenerated from the app so both surfaces stay one catalog (sync tests
  green). Acceptance: carry over the v6.33.0 checklist; additionally run
  one One-Tap AI Retouch and one Retouch A Style pass in real Photoshop
  and confirm the new glam finish returns as layers with the face
  unchanged. Artifact `HNK_Ai_Panel_v6.34.0.ccx`, SHA-256
  `737d02c9ddfd00bd78818d97630a89667552688ffedb1d878c718ba7d6ea3298`,
  1,288,240 bytes (the digest the publish lane rebuilt and verified on
  2026-08-31; an earlier pre-one-skin build was recorded here first).
  Stays disabled for customers until this acceptance.
- **v6.33.0** — `pending`, now superseded by v6.34.0 (the glam retouch prompts above)
  before Photoshop acceptance; its rename content ships within v6.34.0. Original entry follows.
- **v6.33.0** — `pending`. The rename wave (2026-08-31, owner: meitu နဲ့
  evoto အမည်ကို Retouch A နဲ့ Retouch B ဆိုပြီးပြောင်းမယ် — website,
  webapp, Photoshop panel, ဘယ်နေရာမဆို). Every user-visible "Meitu"
  becomes "Retouch A" and every "Evoto" becomes "Retouch B" across the
  panel's I18N strings, tab surfaces and catalog labels; internal
  identifiers (p_meitu/p_evoto ids, storage keys, catalog keys) are
  deliberately unchanged so presets, history and installs carry over
  untouched. The web app and landing rename ships in v5.60.0 in the same
  merge. Acceptance: carry over the v6.32.0 checklist; additionally
  confirm in real Photoshop that the Retouch tab and Library show
  "Retouch A" / "Retouch B" labels with no "Meitu"/"Evoto" remaining
  anywhere in the visible UI, and that a preset saved under v6.32.0
  still loads. Artifact `HNK_Ai_Panel_v6.33.0.ccx`, SHA-256
  `3108b06e6075` (full digest in release-manifest.json), 1,287,432
  bytes. The release stays disabled until that acceptance.
- **v6.32.0** — superseded by v6.33.0 (the Retouch A/B rename above)
  before Photoshop acceptance; its content ships within v6.33.0.
  The real-things-only wave (2026-08-30, owner:
  ratio ကို ပုံသဏ္ဌာန်နဲ့ / workflow အလိုက် သုံးလို့ရတဲ့ model / model
  အစစ်ပြ / ဘာသာစကား အစစ်ပဲပြ). The panel's share of the wave is the
  language picker: measured against its ~560-key I18N table, only the
  nine core languages are complete and only hi/bn/ta/te carry ~500-key
  native packs — the picker now offers exactly those 13. The ten
  Myanmar-ethnic rows (zero native panel strings — pure Burmese-fallback
  shells) and the eleven ~22-key starter shells are retired from the list
  until reviewed packs land; their pack data and fallbacks stay dormant
  in code, and an install storing a retired code returns to the default
  language through the existing LANG_CODES guards. Nothing else in the
  CCX changes; the web app's side of the wave (visual ratio rail in the
  workflow wizard, per-workflow model capacity filter, authentic family
  marks, 27-language picker) ships in v5.56.0. Acceptance: carry over the
  v6.31.0 checklist; additionally open the language dropdown in real
  Photoshop and confirm 13 rows, each rendering real text when picked.
  Artifact `HNK_Ai_Panel_v6.32.0.ccx`, SHA-256
  `cbd8ebfcc52ba57a87f7bade53d4c50f4f5ae50f4475856df63f409fa7f2769d`,
  1,287,438 bytes. The release stays disabled until that acceptance.
- **v6.31.0** — superseded by v6.32.0 the same day (the language-picker
  honesty pass above) before Photoshop acceptance; published to the
  private release store, its content ships within v6.32.0.
  The completeness pass the owner's "are the
  i2i/t2i models really all there?" question triggered (2026-08-30): a
  programmatic cross-check of every image doc id in RunningHub's index
  against the wired endpoints found exactly two absentees, both now
  closed.
  * z-image-turbo/image-to-image-lora (api-448184490): the LoRA sibling
    of the wired non-LoRA route — node-keyed 44##image / 18##text /
    41##select (shared "1".."7" table; the doc's default "8" is the
    unused custom slot, fallback "1") / 42##file_type. The optional
    43## LoRA pair is omitted (documented default strength 0 = plain
    Z-Image Turbo; the f-2-dev/edit-lora precedent). Registry grows
    96 → 97 models; the 46-check audit expects the 98-option selector.
  * vidu/reference-to-video-q2-pro (api-448184544, web app only): filed
    under Image > reference-to-image in the doc index although it is a
    video endpoint, so both catalog sweeps missed it; fetched in round 4
    and wired beside its q2 sibling (prompt REQUIRED, imageUrls ≤7
    optional, documented enums for ratio/resolution/duration; its
    optional `videos` refs are not sent — no video-ref slot).
  Every other image doc id is verified wired (the six 6.29.0 endpoints
  wired from owner-pasted specs carry no api-id comment, which is why a
  comment-only scan overcounts). Acceptance carries over the v6.30.0
  checklist plus one Z-Image LoRA edit spot-check.
  * Owner decision the same day, after the field report below: the
    pairing-code step is REMOVED end to end ("code နဲ့ပတ်သက်တာတွေ
    ဖြုတ်ပေးပါ"). The panel now registers itself at sign-in
    (registerPanelDevice joins — or claims — the account's computer
    slot); the web app's "Create Panel pairing code" button, the
    /v1/devices/pairing-code endpoint and the gate's code input are all
    gone. What the code never actually provided is unchanged: the
    partial unique index still allows ONE active panel installation per
    account, a second machine is refused with panel_slot_occupied, and
    the audited admin Reset Computer action stays the only recovery
    path. The device_pairing_codes table and DEVICE_PAIRING_SECRET stay
    in the schema/env contract (no destructive migration; reset still
    clears stale rows). Contract tests re-pinned to the new flow:
    direct registration joins the computer slot, a second panel is
    refused, and the retired pairing surface must stay gone.
  * Field-report fix folded in the same day: a student's real-Photoshop
    screenshot showed the pairing gate dead-ending on the generic
    "Device could not be registered". The backend has always sent the
    specific reason (invalid_pairing_code / pairing_expired /
    pairing_already_used / panel_slot_occupied / computer_device_required
    / device_mismatch) in the response's `error` field; the gate now maps
    each to actionable Burmese guidance (fresh-code-within-5-minutes,
    case-sensitive typing, ask the admin for Reset Computer) instead of
    discarding it.
  * Stay-signed-in fix, same day (owner: "တစ်ခါဝင်ပြီးရင် ထပ်ခါထပ်ခါ
    မဝင်ရအောင်"): repeated logins traced to hard refresh-token rotation —
    when Photoshop quit before the rotated token reached disk (or the
    reply was lost), the stored credential was already spent and the
    next launch demanded a password. The sessions table now parks the
    immediately-previous token hash (prev_refresh_token_hash, additive
    column) and web/panel sessions may re-join the chain with it —
    repeatedly if replies keep getting lost — while a superseded middle
    token stays dead, ADMIN sessions stay strict single-token, and
    logout/revocation closes the parked token too (all pinned in
    verify_unified_backend_contract and verify_api_service Y2/Y3/Z/Z2).
    The gate also serializes concurrent refreshes behind one in-flight
    call. Net effect: one sign-in per machine; only a 30-day idle gap,
    sign-out, or an admin action asks for the password again.
  * Seat-model device limits, same day (owner: "စက်ဘယ်နှစ်လုံးသုံးမလဲ
    အတိုးအလျော့ကို admin က သတ်မှတ်"): device slots become fungible SEATS
    counted against the profile's `allowed_devices` (the column the
    renewal payment already multiplies by), instead of the hard
    one-phone-one-computer pair. The `UNIQUE (user_id, slot_type)`
    constraint is dropped (replaced by a plain lookup index);
    `claimSlot` takes a per-user advisory lock, counts active seats
    against the admin-set limit (default 2, admin-adjustable 1–20 via
    the new audited `set_devices` action + the admin UI's device dial),
    and revives a reset seat before creating one. New installs sit on an
    existing seat with a free place for their client type first, so a
    web browser and the panel can share one computer seat as before.
    The ONE-active-panel-per-seat partial unique index is unchanged: a
    second panel machine is still refused with panel_slot_occupied until
    Reset Computer or a raised limit grants a fresh seat. Pinned in
    verify_unified_backend_contract (fungible-seat narrative incl.
    limit-raise admitting a new machine), verify_unified_schema (both
    schema files), and the admin action registries.
  * Register/sign-in UX wave, same day, panel side: the locked gate
    greets a returning student by their saved e-mail while re-checking
    ("👋 you@… — gate_checking") instead of flashing the sign-in form;
    a bilingual "Forgot password? / စကားဝှက်မေ့နေလား" link under the
    sign-in button opens the web app where reset lives; the refusal
    reason map keeps only the three slot/mismatch reasons that still
    exist. Web-app side (v5.55.0): the signup form carries a three-step
    journey strip (account → payment → start), a live password-strength
    hint (guidance only — the 6-character server minimum stays the only
    hard rule), and the device card explains in Burmese that this
    machine is now auto-remembered and the admin can raise the seat
    count.
  Acceptance addition for this decision: sign in on a machine with NO
  prior pairing and confirm the panel unlocks with no code step; then
  confirm a second machine is refused until Reset Computer; then quit
  and relaunch Photoshop and confirm the panel opens WITHOUT asking for
  the password; then have the admin raise the account's device limit by
  one and confirm the refused machine signs in on the next attempt.
  Artifact `HNK_Ai_Panel_v6.31.0.ccx`, SHA-256
  `1f1eb1a7c25acd2c10c816b0d4be120822967c29ed01e3b731f1de2e1a51af6f`,
  1,287,652 bytes. The release stays disabled until that acceptance.
- **v6.30.0** — superseded by v6.31.0 the same day (the completeness
  pass above) before Photoshop acceptance; it was published to the
  private release store and its content ships within v6.31.0.
  The full image-catalog wave (2026-08-30), the
  owner's "အကုန်ထည့်ပေးပါ" instruction executed literally: every image
  endpoint in RunningHub's public doc index is wired, or its absence is
  recorded. 74 new models (31 image-to-image + 43 text-to-image) join BOTH
  apps — the panel registry grows 22 → 96 models and the web app's
  RH_MODELS/RH_T2I_MODELS grow identically; every entry carries its
  `api-<id>` doc citation, and every body was parameter-verified against
  the doc the fetch lane pulled (round 2: 79 catalog docs, ten matrix
  jobs, zero failures).
  * New declarative body kinds, mirrored field-for-field across web app
    and panel adapter: a generic ComfyUI `node` kind whose per-model key
    map covers single- and multi-slot graphs (qwen edit-2511 fills
    57##/58## and leaves 59## absent with two refs) over the shared
    "1".."7" ratio table with per-model "9" auto-match; `grokimg` (one
    endpoint, four Grok versions behind a REQUIRED model field — shipped
    as g-4.2); `sdlayer` (Seedream 5 layer decomposition); `sd5lite`/
    `sd5pro` (their real resolution enums + png output); `wan25` (the
    documented 8-ratio size table, omitted on Auto); `nanov1` (REQUIRED
    aspectRatio whose Auto is the literal "auto"); `ratioOnly`; `gpt15`
    (ratio picks the fixed size — NO aspectRatio field exists, so none is
    sent); and `bare` (prompt + imageUrls only). The seven Topaz models
    ride the proven upscale/upscale-transparent shapes. T2I defs gain the
    matching flags (nodeKeys with conditional fileType, autoRatioValue,
    ratioForSizeOnly, wan25/gpt15 size maps, whField, numImagesField).
  * Control honesty scales with the catalog: kind-driven noRatio/noSize
    tables hide the web app's Ratio/Size pickers wherever an endpoint
    declares no such field, and the Ratio dropdown narrows to each
    model's documented enum (generic node models get the shared seven).
  * The wave's own sweep caught a real dispatch bug before ship:
    rhModelCfgOut handed rhV2Body a stripped copy (id/apiPath/kind/…)
    that silently dropped the new declarative fields — a node-kind body
    came out as literally {"undefined":"..."}. The dispatch cfg now
    carries the WHOLE model def with the user-editable effective values
    layered on top; the panel was already safe (its resolve() deep-merge
    returns full entries).
  * Recorded as unobtainable, per the same instruction: RunningHub's LLM
    API has no page in the public doc index at all, so the panel's
    translate/Improve-Prompt hooks stay unwired until the owner supplies
    that spec from the portal's separate LLM section. Deprecated pages
    (gpt-image-1.5 low-price) are skipped on the doc site's own advice.
    Video catalog top-up, 3D and audio are separate future waves.
  * Tests grow with the surface: sweep_runninghub mocks 16 endpoints and
    proves the new shapes on the wire (multi-slot node fill, grokimg
    model field + hidden controls, nano v1 "auto", sd5-pro enum clamp +
    png, Topaz gigapixel outputWidth/Height); sweep_text2img covers 49
    T2I options with wan-2.5 default size, gpt-1.5 fixed size + quality
    with no aspectRatio, MJ v8.2's REQUIRED hd flag, nano v1 "auto" and
    z-image-turbo's node body. The 46-check panel audit expects 97
    selectable models.
  Acceptance carries over the v6.29.0 checklist, plus catalog spot-checks
  in real Photoshop: a two-image "Qwen Edit 2511" edit, one Topaz
  Gigapixel upscale landing as a layer, a "Wan 2.5 — T2I" generation at a
  non-square ratio, and one Grok Imagine (grokimg) edit.
  Artifact `HNK_Ai_Panel_v6.30.0.ccx`, SHA-256
  `bffcb63b1007617b17569027b06b8fe807a121a9697dd34885a34e864d05bc8d`,
  1,286,513 bytes. The release stays disabled until that acceptance.
- **v6.29.0** — superseded by v6.30.0 the same day (the full-catalog
  wave above) before Photoshop acceptance; it was published to the
  private release store and its content ships within v6.30.0.
  Five owner-supplied OpenAPI specs (2026-08-30)
  plus a read-only CI doc-fetch lane (`fetch-docs.yml` — the container's
  egress policy blocks runninghub.ai, so a GitHub runner curls the PUBLIC
  doc pages into its job log; no secrets, no repo writes) close out every
  held endpoint and correct FOUR shipped request bodies in one release —
  and put a parameter-verified doc behind every single image model:
  * flux-2-dev TEXT-to-image is CORRECTED too (fetched doc api-448184518):
    node-keyed like its siblings — 12##text / 41##select (the shared
    "1".."8" table, 8=custom unused, NO auto option → fallback "1"=1:1,
    the old default) / 43##file_type, all REQUIRED. The T2I builders in
    both apps gain a nodeKeys path; the flat prompt/aspectRatio/
    outputFormat body is gone.
  * "RH Image G-2" is IDENTIFIED (fetched doc api-448184504): its endpoint
    is "gpt-image-2.0/edit-channel-low-price" — GPT Image 2's cheaper
    channel route (doc's own caveat: best-effort stability, most results
    1k). Relabeled "GPT Image 2 (Low-cost)" / "GPT Image 2 — Low-cost";
    body verified field-for-field (no quality field — none sent); prompt
    capped at the documented 20000.
  * qwen-image-3.0-pro T2I's prompt cap raised 2048 → the documented 3000
    (fetched doc api-494859258); its "size" confirmed free-form W*H.
  * Every other shipped image model verified against its fetched doc with
    NO change needed: nano-banana-2 + Pro/Pro-official edit + Pro T2I
    (prompt+imageUrls+required resolution+optional aspectRatio, enums
    match), qwen 2.0/2.0-pro edit (≤800 prompt, ≤3 images, size enum
    matches the map), wan 2.7 edit/edit-pro (≤2048 prompt, w/h 512-4096),
    youchuan v8.1 (REQUIRED hd flag — already sent — and the exact
    7-ratio enum), Grok Imagine quality T2I (ratios/tiers/numImages as
    shipped), f-2-dev/edit (read: single image, node-keyed — capability
    equal to the wired edit-lora, so no second flux edit model), and the
    account-status path used by the video-cost tooling.
  Base specs of the wave: FLUX.2 Dev's image-editing route
  (`rhart-image/f-2-dev/edit-lora`), GPT Image 2's official text-to-image
  (`rhart-image-g-2-official/text-to-image`, held since v6.28.2 for
  exactly this parameter table), Z-Image Turbo, and the two Grok Imagine
  edit routes:
  * "RH Image X (Official)" is IDENTIFIED: its spec is titled
    "xai/grok-imagine-image/edit-official-stable" — Grok Imagine's image
    edit model. Relabeled "Grok Imagine — Edit (Official)" in both apps
    (same id/endpoint; the GPT Image 2 precedent). Its body declares
    EXACTLY prompt (5–20000) + image — the resolution and aspectRatio the
    default branch used to append were undeclared params and are gone
    (new kind:"xedit"); the web app hides Ratio/Size for it and the panel
    registry stops advertising sizes/ratios the endpoint cannot honour.
  * "RH Imagine Image Quality" (edit) is likewise titled
    "xai/rhart-imagine-image-quality/edit-official-stable" — relabeled
    "Grok Imagine — Quality Edit". Fixed to its spec: prompt now capped
    at the documented 4000, and the optional aspectRatio restricted to
    the spec's own enum (auto + seven ratios) — the generic pass-through
    could previously ship 4:5/5:4/21:9, values outside that enum. The web
    app's ratio dropdown narrows to the documented set for it.
  * Z-Image Turbo's request body is CORRECTED in both apps: the owner's
    spec for `rhart-image/z-image-turbo/image-to-image` shows it is
    ComfyUI node-keyed like its rhart-image/ sibling f-2-dev/edit-lora —
    66##image / 41##text / 64##select (the same "1".."7" ratio table,
    no auto option) / 65##file_type, all REQUIRED. The flat
    imageUrl/prompt/aspectRatio/outputFormat body shipped since the v2
    port carried the right values under keys this spec does not declare;
    both apps now send the node keys, with the same 1:1 fallback for
    Auto/out-of-enum ratios the flat body used. UI is unchanged (seven
    ratios, no Size). NOTE: the sibling `rhart-image/f-2-dev/
    text-to-image` (flux t2i) still ships the flat body its own doc was
    read as confirming — its current page has been requested from the
    owner to check whether it is node-keyed too.
  * GPT Image 2 T2I joins both apps — the web app's T2I page
    ("GPT Image 2 (Official) — Poster & Text") and the panel registry
    (`rh-image-g2-t2i`, 22 models now). Body per the spec: prompt
    (1–20000, REQUIRED), aspectRatio (optional 15-value enum, omitted on
    Auto so the server's documented 16:9 default applies), resolution
    (REQUIRED 1k/2k/4k, always sent), quality (REQUIRED, shipped as the
    documented default "medium" like the i2i sibling). No
    outputFormat/numImages/size fields exist on this endpoint, so none is
    sent. The panel's Auto selector now routes poster/visible-text jobs
    WITHOUT images to it (interim nano-banana-pro-t2i route retired),
    completing the owner's original "Auto poster → GPT Image 2" ask for
    both the with-images and no-image cases.
  * Real fidelity bug fixed on the way: the panel's t2i request branch
    sent one blanket flux-shaped body (aspectRatio + outputFormat:"png")
    for every t2i model — an undeclared outputFormat for Nano Banana
    Pro/Qwen 3.0, no documented resolution for Nano/Imagine, no "size"
    for Qwen 3.0, and a droppable-on-Auto aspectRatio for flux (whose doc
    marks it REQUIRED). The branch is now flag-driven per model config,
    genuinely mirroring the web app's rhV2SubmitT2I defs (t2iRatios/
    ratioRequired/resolutionField/numImagesField/outputFormat, plus the
    Qwen 3.0 T2I size map ported verbatim).
  * The web app's last placeholder is gone: "Flux 2 Dev (RunningHub — needs
    endpoint)" (empty apiPath since the v2 port) is now "Flux 2 Dev — Edit"
    on the documented endpoint. The panel gains the matching
    `flux-2-dev-edit` registry model ("FLUX.2 Dev — Edit", single image,
    ratio-only output control) beside the existing flux-2-dev
    text-to-image entry — every registry model has a real endpoint.
  * The endpoint's body is ComfyUI node-keyed, unlike every other wired
    endpoint: `51##image` (ONE image URL), `16##text` (prompt),
    `47##select` (ratio enum — "1".."7" fixed ratios per the spec's
    option table, "9" auto-match; sent for Auto and for any undocumented
    ratio, since the field is REQUIRED), `52##file_type` ("PNG"). Both
    apps build it in a dedicated `fluxedit` branch, identical
    field-for-field.
  * The optional `18##lora_name`/`18##strength_model` pair is deliberately
    omitted: the spec's default strength is 0 (no LoRA effect), and the
    only documented LoRA name is the server's own default — sending a
    guessed .safetensors name would invent a server-side asset. A LoRA
    picker can follow when the owner supplies the available LoRA list.
  * Control honesty carried over: the web app hides Size for this model
    (the endpoint has no resolution tier — custom W/H exists only behind
    the unused "8" option) and narrows the Ratio dropdown to the
    documented seven plus Auto (no "4:5").
  * sweep_runninghub now proves the node-keyed flux body on the wire
    (mocked endpoint): correct four fields, prompt wrapped as usual inside
    16##text, no standard prompt/imageUrls/resolution/aspectRatio keys, no
    LoRA keys, Auto ratio → "9", and the narrowed/hidden controls.
    sweep_text2img gains the GPT Image 2 T2I model (6 models) with two
    on-the-wire body checks: required resolution+quality with no invented
    fields, and Auto behavior (resolution still sent, aspectRatio
    omitted).
  Acceptance carries over the v6.28.2 checklist, plus: pick
  "FLUX.2 Dev — Edit" in AI Tools with one image and a Burmese/English
  instruction and confirm a real edited result lands as a layer; and an
  Auto poster request with NO image must resolve to
  "GPT Image 2 — Poster & Text (T2I)" and generate.
  Artifact `HNK_Ai_Panel_v6.29.0.ccx`, SHA-256
  `238c9ef3160a2473b43a231f4712edb0f5900fe5e3de503651d502265a56696a`,
  1,279,189 bytes. The release stays disabled until that acceptance.
- **v6.28.2** — superseded by v6.29.0 the same day (the FLUX.2 Dev edit
  endpoint above) before acceptance completed. GPT Image 2 becomes REAL in
  both apps, from the owner's own verified Enterprise-Shared reference PDF
  (2026-08-30):
  * The reference's "Exact verified photo endpoints" table maps
    rhart-image-g-2-official to GPT Image 2 official stable — the endpoint
    this project has shipped WORKING since the openapi/v2 port, hidden
    behind the label "RH Image G-2 (Official)". Relabeled to
    "GPT Image 2 — Official" in the web app and the panel (same id, same
    endpoint, same documented required quality — the Grok Imagine relabel
    precedent).
  * The never-configured "gpt-image-2" placeholder entry is retired from
    both apps; in the panel the old id joins LEGACY_ALIASES →
    rh-image-g2-off so every stored draft/preset keeps resolving. 20
    models remain, all with real endpoints — no placeholder anywhere.
  * Real bug fixed on the way: the panel's Auto-model selector routed
    every poster/visible-text request to the placeholder, i.e. to a model
    that could never run. Poster jobs with images now go to
    rh-image-g2-off (the verified GPT Image 2); poster text-to-image goes
    to nano-banana-pro-t2i (the registry's confirmed high-visible-text
    T2I).
  * The reference also lists GPT Image 2 text-to-image
    (rhart-image-g-2-official/text-to-image) — held until its parameter
    table is provided, per the wire-nothing-unread rule.
  * Same-day follow-up: the owner supplied the model's own verified
    image-to-image parameter table (RunningHub api-detail
    2046514150500524035). Both apps' shipped request bodies match it
    field-for-field — prompt (≤20000, both cap there), imageUrls
    (List, 1–10; both declare maxImages 10), resolution REQUIRED
    (1k/2k/4k; both always send it), aspectRatio optional (both send a
    doc-enum subset, omit on auto), quality REQUIRED (both always send
    the configured "medium"). The endpoint identification above is now
    parameter-verified, not just name-verified; no code changed.
  Acceptance carries over the v6.28.1 checklist, plus: an Auto-model
  poster request must resolve to GPT Image 2 — Official and generate.
  Artifact `HNK_Ai_Panel_v6.28.2.ccx`, SHA-256
  `735e22b41b07c089174274093ea90fa9abdc1b3515707c3ba0c81095d9098e8a`,
  1,275,279 bytes. Never enabled; its content ships within v6.29.0.
- **v6.28.1** — superseded by v6.28.2 the same day (the GPT Image 2
  identification above). The owner's de-duplication pass over 6.28.0
  ("every setting has ONE home"):
  * The Enterprise key now lives ONLY on the Setup tab. This fixes a real
    split, not just a duplicate control: the classic stack persists to
    hnk_students_settings.json while the AI Tools stack persists to
    hnk_ai_tools.json — so a key saved in Setup never reached Free
    Generate, and the AI Tools Settings screen had grown its own key
    field. main.js now bridges Setup's key (HNK.studioKey) and the AI
    Tools settings service adopts it whenever its own store has no key —
    saved once in Setup, used everywhere. The AI Tools Settings screen
    drops its key field, and its Language/Theme pickers (duplicates of
    the header controls); it keeps what exists nowhere else: the AI Tools
    defaults, Panel Density, Direct Generate, Add-as-Layers and the
    advanced endpoint form.
  * A 48px (with 96px @2x) plugin-list icon of the owner's HNK mark joins
    the manifest's 24px entry: some Creative Cloud builds read the larger
    species entry for their plugin tile. Note honestly recorded: the CC
    desktop app's tile for a NON-marketplace (sideloaded) CCX is drawn by
    Creative Cloud itself and may stay generic regardless — only an Adobe
    Marketplace listing controls that surface; inside Photoshop's own
    Plugins list the mark shows.
  * gpt-image-2 stays "needs endpoint" for one more release: RunningHub's
    own registry lists gpt-image-2 endpoints, but this environment cannot
    open the doc page that carries the exact parameter table, and this
    repo wires no endpoint it has not read (the rule that has kept every
    other model honest). It is wired in both apps the moment the doc's
    Endpoint line + parameter table are provided.
  Acceptance carries over the full v6.28.0 checklist below, plus: Setup's
  key alone must power an AI Tools Free Generate, and the AI Tools
  Settings screen must show no key/language/theme controls.
  Artifact `HNK_Ai_Panel_v6.28.1.ccx`, SHA-256
  `ae9e41da63e2299c21d5a2b4d63ce36e799815f9a9f365e692fc6ce61e98bb6a`,
  1,274,761 bytes. The release stays disabled until that acceptance.
- **v6.28.0** — superseded by v6.28.1 before acceptance completed (the
  settings de-duplication above). The owner's first real-Photoshop acceptance run
  on 6.27.0 (MacBook Pro, Photoshop 2026) proved sign-in, computer pairing
  (code from the web app's Account page) and the gate end to end — and
  surfaced a set of REAL UXP rendering gaps the browser shim renders
  fine, which this release rebuilds around so the CCX finally looks like
  the web app on the actual host ("တစ်ပုံစံတည်း", the owner's words):
  * Banner legibility scrims are BAKED INTO the JPEGs now (all six page
    banners + the three greeting arts, regenerated from the web app's own
    plates with the shade composited in PIL). On the owner's Mac the old
    shade div's `background:` gradient never rendered, leaving white
    headlines on raw bright art; pixels render on every engine. The CSS
    gradient survives as a browser-side bonus only, and the greeting
    card's pseudo-element overlay (which UXP also never drew) is gone.
  * The bottom nav is the web app's own: its i-home/i-sparkle/i-pen/
    i-sliders/i-frame/i-gear stroke icons (inlined — UXP has no
    <symbol>/<use>) above 9.5px labels, active tab gold on a soft gold
    tint. The old text-pill tabs truncated to "H… Cr… Re…" at real panel
    widths.
  * The header is the web app's compact top bar (small logo, gold HNK
    wordmark + AI PANEL label, version line, language + theme controls).
    The full-height hero-art header — which truncated its own title and
    spent a third of a narrow panel — is deleted along with its
    icons/hero-banner.jpg.
  * The AI Tools section pills are sized like the web app's subtab pills
    so Freeform · Workflows · History · Settings sit on one row (they
    wrapped 2×2 on the owner's Mac).
  * The sign-in password field gains an eye toggle (div-button +
    stylesheet + painted inline styles like every gate control): UXP
    paints `type="password"` with no visible dots on some hosts — the
    owner's keystrokes registered but the field looked dead. Same
    `input.type` flip the Setup key field has always shipped with.
  Acceptance carries over the full v6.27.0 checklist below, plus: the six
  banners must read with their headlines legible, the six bottom tabs
  must show icon + full label untruncated, and the password eye must
  reveal typed text.
  Artifact `HNK_Ai_Panel_v6.28.0.ccx`, SHA-256
  `e5355f4c0810011e415497cc2df4e41e0df02bfc372dc4f8b063293b331a6125`,
  1,244,981 bytes. The release stays disabled until that acceptance.
- **v6.27.1** — superseded by v6.28.0 the same day, unreleased to any
  student: it carried only the password-eye fix before the owner's
  screenshots showed the wider UXP rendering gaps above, which belong in
  one coherent rebuild rather than a papercut trail.
- **v6.27.0** — superseded before acceptance completed (sign-in, pairing
  and the gate itself passed on the owner's real Photoshop; the UI
  rendering gaps above did not). The owner's inside-and-out audit
  wave (a v6.26.3
  carrying only the applyDefaultsTo fix was built but never published;
  its scope is folded in here):
  * `applyDefaultsTo` restored verbatim in settings-service — the v6.26.0
    OpenAI removal deleted it while the return object and the AI Tools
    bootstrap still referenced it, so the AI Tools tab threw at start in
    6.26.0–6.26.2.
  * Workflow card art now SHIPS in the CCX: `icons/cards/<id>.jpg`, one per
    registry workflow, re-encoded from the web app's own public cards5
    catalog (docs/app/lib/wf/cards5 — in-house art, no third-party
    provenance), plus the screen banners and gate hero from the same
    catalog. Every shipped release before this one rendered the workflow
    list and screen banners imageless in real Photoshop.
  * Home and Workflow Tools lists redrawn to web-app parity: each workflow
    shows its full catalog card at intrinsic 3:2 (UXP-safe `<img>`), text
    beneath — the same card language the web app uses.
  * Library preset select fixed: the full plates never shipped in the CCX,
    and unlike the card thumbs (fixed v6.25) the select path still read
    the plugin folder and threw — every preset tap silently failed. It now
    fetches the plate from the licensed web host the manifest already
    allows, with the plugin-folder read kept as the dev-tree fallback.
  * Text / Logo workflow re-routed from gpt-image-2 — whose RunningHub
    endpoint is an intentionally-empty placeholder, so the workflow could
    never generate — to the confirmed nano-banana-2 edit deployment its
    sibling workflows use. Deployment audit: every panel apiPath
    (rhart-* and platform paths alike) verified present in the web app's
    client; none invented.
  * Web-app tab parity (owner request): the tab bar reads like the web
    app's — Home (the workflow card home) first and the fresh-boot landing
    tab, then Edit (the prompt studio), Create, Retouch, Library (the
    1850 catalog), Setup last. Same six pages; names, order and landing
    match the web app. The AI Tools stack's localized pill row became the
    web app's English section pills (Freeform · Workflows · History ·
    Settings) with the Home duplicate removed — the bottom Home tab now
    returns to the cards home from any sub-screen.
  * Each family in its own group (owner request): the one-tap Presets
    (Meitu/Evoto styles included), Chains, Ref ops, Scenes, Wedding,
    Recipes, Lighting and the Pipeline moved from the old Presets page
    into Edit — they all drive the Edit page's runGenerate/Keep/cleanup
    machinery, which the Edit-page batch (photos + output folder, the
    web app's Path counterpart) already advertises. The Library tab now
    holds only the 1850 Visual Library, like the web app; Retouch keeps
    the slider suite plus the Meitu/Evoto style buttons.
  * Web-app page heroes (owner request): every page banner now reads like
    the web app's — an English kick (Freeform Create · Text to Image ·
    Retouch Pro · Reference Library · Setup · Smart Workflow) over the web
    app's own localized headline (Burmese for my, the web app's English
    line elsewhere), on the web app's own banner art bundled into the CCX
    (flower-portrait, coral-fairy, flower-gown, train-station, archer).
    The Library card opens by default — the Library tab IS the library.
  * The FULL Smart Workflow catalog (owner request: "there are over 100"):
    all 131 workflows the web app composes for its Workflows page — core
    definitions plus the preset/cleanup/wedding/scene-derived one-taps,
    prompts, negatives and input labels included — now ship in the CCX as
    a GENERATED data file (js/hnk_wf_catalog_data.js) taken from the web
    app's own composed catalog (window.HNK_WF_CATALOG), never re-derived
    by hand. The panel's Workflows list shows them grouped by the app's
    own nine categories; the nine hand-built definitions stay
    authoritative for their ids; wrapped items run the same confirmed
    nano-banana-2 edit deployment as the app's tier; card art loads from
    the licensed host with a text fallback offline.
    test/verify_panel_wf_catalog_sync.js pins the file to the app.
  * Model set completed to the web app's (owner request): the three
    text-to-image models the app carries and the panel lacked — Nano
    Banana Pro (T2I, official), Qwen 3.0 Pro (T2I) and RH Imagine
    Quality (T2I) — added to the model registry and RunningHub config
    with their endpoints ported verbatim from the app's own client
    (`rhart-image-n-pro-official/text-to-image`,
    `alibaba/qwen-image-3.0-pro/text-to-image`,
    `rhart-imagine-image-quality/text-to-image`). 21 models total; no
    path invented.
  * Every image slot offers all four sources (owner request): the AI
    Tools surfaces caught up with the classic tabs — each Smart Workflow
    input row and the Free Generate slot strip now offer Active Layer ·
    File · Web Link · Library (classic Edit ×2 and Create ×4 slots
    already carried all four). The OS file picker lives in the host
    adapter (`pickImageFile`), the Web source opens an inline URL row,
    and the Library source uses the existing last-pick bridge. The audit
    shim proves both new paths end-to-end: a web link really imports
    into a workflow slot and a Free Generate slot through the real host
    adapter.
  * Hero banners complete — ten shipped visuals (owner request): the web
    app's time-greeting hero (same morning/afternoon/evening clock split,
    same three banner arts, all nine language greetings) now opens the
    AI Tools Home, bundled beside the six page banners and the gate
    hero. Two stale unreferenced banner duplicates removed
    (icons/banners/{master-bgfg-replace,reference-transfer}.jpg — their
    icons/cards/ copies are the referenced ones), so the CCX shrinks
    slightly despite the three new arts.
  Real-Photoshop acceptance MUST cover the full v6.26.2 checklist above,
  with special weight on: the AI Tools tab opening to the workflow home
  WITH card art visible AND the time-greeting hero, an AI Tools generate,
  all four sources visible on one workflow input row (and a web-link
  import), a library preset tap landing in Reference 2, and a Text / Logo
  generate.
  Artifact `HNK_Ai_Panel_v6.27.0.ccx`, SHA-256
  `215551a31bc96354ba7323268c501a8babcddae488ba2481d9c0dd132f250b48`,
  1,341,521 bytes (the bundled card art accounts for the growth over
  6.26.2's 524,577). The release stays disabled until that acceptance.
