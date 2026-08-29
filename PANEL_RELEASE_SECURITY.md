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
3. verify login, computer pairing, online failure, update-required behavior,
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
- **v6.27.0** — `pending`. The owner's inside-and-out audit wave (a v6.26.3
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
  Real-Photoshop acceptance MUST cover the full v6.26.2 checklist above,
  with special weight on: the AI Tools tab opening to the workflow home
  WITH card art visible, an AI Tools generate, a library preset tap
  landing in Reference 2, and a Text / Logo generate.
  Artifact `HNK_Ai_Panel_v6.27.0.ccx`, SHA-256
  `3e72f821e167abb9ebfce2f247235e694407d1eadf3b890230553fccae501a39`,
  1,425,652 bytes (the bundled card art accounts for the growth over
  6.26.2's 524,577). The release stays disabled until that acceptance.
