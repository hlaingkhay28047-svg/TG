# TG

Adobe Photoshop plugin tools and HNK web app.

## Always-live upgrade flow

Every upgrade should have a live DigitalOcean copy automatically:

1. Work on `upgrade-safe-wave`.
2. Every push to `upgrade-safe-wave` runs GitHub CI and updates DigitalOcean staging `hnk-ai-tools-2`.
3. As soon as the full CI sweep is green, merge to `main` — tested upgrades ship immediately by standing owner approval; the test suite is the release gate.
4. Every push/merge to `main` updates DigitalOcean production `hnk-ai-tools-3` and verifies `/app/version.json` matches the repository release.
5. Web app, landing site and Photoshop panel always ship together in one wave.

This keeps both GitHub and DigitalOcean moving together while still separating unfinished staging code from the production app.

## Supabase — accounts, the Premium wall and the admin panel

From web v5.30.0 the app opens on a login wall: no session shows sign-in, a
signed-in account with no active plan shows the buy flow, and only an active
plan reaches the studio. A foreground tab re-reads the profile every five
minutes, so an expiry or an admin approval lands without a manual refresh, and
a sign-in older than 30 days is asked to log in again. Admins get a payment
card on Home that approves or rejects each request.

**None of that is a security boundary.** `docs/` is a static site holding the
anon key, so every request the browser makes can be replayed by hand. The wall
and the admin card are user interface. What actually stops a customer approving
their own payment is row-level security, and it lives in `supabase/schema.sql`.

Apply it once — Supabase dashboard → SQL editor → paste → Run (it is
idempotent) — then grant yourself admin:

```sql
update public.profiles set is_admin = true where email = 'you@example.com';
```

The file also carries the two triggers the client deliberately does not do
itself: approval extends the plan in the database (from the later of now and
the current expiry, so renewing early adds time instead of losing it), and a
guard trigger reverts any attempt by a non-admin to write their own
`plan_status`, `plan_expires_at`, `allowed_devices` or `is_admin`.

Until it is applied, treat the admin panel as a convenience and assume any
signed-in user could approve themselves. Section 9 of the file is the check
that proves it took.

**Re-run it after web v5.32.0.** That release closed three holes in the file
itself, so a project still running the older schema is not protected by the
paragraphs above:

- `app_settings` — the row holding `payment_instructions_my`, i.e. the bank
  account number every customer wires money to — had no row-level security at
  all. Supabase's default grants make an RLS-less table not merely readable but
  *writable*, so one `PATCH` from a browser console could have redirected the
  studio's revenue. It is now RLS-on with a read-only policy and no write
  policy of any kind.
- The device cap was enforced only in the browser. It is now a trigger, raising
  the same `P0001` the client already knows how to explain.
- The guard trigger used to run its admin check unconditionally, and
  `auth.uid()` is NULL in the SQL editor — so the guard blocked the very
  `update ... set is_admin = true` bootstrap above. It now returns early when
  there is no authenticated user, which is exactly the SQL-editor case and
  never a browser one.

The file stays idempotent, so re-running it is safe whatever state the project
is in. `test/verify_rls_contract.js` proves the schema covers every table the
client actually fetches, but no test in this repo can prove you have run it.

## Password reset, and the one setting it needs

Web v5.33.0 moved the reset page onto this origin, at `/reset/`. Before that
`ACC_RESET_URL` pointed at a third-party preview deployment, which meant the
recovery token Supabase mails — and a recovery token is, while it lives, the
account — was delivered to a host outside the product.

**Owner step, once:** add

```
https://hnk-ai-tools-3-s4nnu.ondigitalocean.app/reset/
```

under Supabase -> Authentication -> URL Configuration -> Redirect URLs. GoTrue
silently falls back to the project Site URL for any `redirect_to` that is not
allow-listed, so a missing entry raises no error: it just quietly sends people
somewhere else. `test/sweep_v533_reset.js` proves the app asks for that URL and
that the page handles the token responsibly, but no test here can prove the
dashboard has it.

## Privacy and terms

`docs/privacy/` and `docs/terms/` are real pages, in Burmese and English, on
this origin. Both are emitted from one shell by `test/_gen_legal_pages.py` —
edit that and re-run it rather than editing the two HTML files, which would
drift. `test/sweep_v533_legal.js` checks the shell is still identical in both
AND that the policy's factual claims still match the code: no analytics, no
photo ever uploaded to our servers, a random device id rather than a
fingerprint, keys and results kept in the browser. Add an analytics snippet or
an image upload and that sweep goes red, because the policy would have become
a false statement made to paying customers.

## DigitalOcean App Platform

- Repository: `hlaingkhay28047-svg/TG`
- Staging branch: `upgrade-safe-wave`
- Production branch: `main`
- Static source directory: `/docs`
- Index document: `index.html`
- Region: Singapore (`sgp`)
- Staging app: `hnk-ai-tools-2`
- Staging host: `hnk-ai-tools-2-gibhz.ondigitalocean.app`
- Production app: `hnk-ai-tools-3`
- Production host: `hnk-ai-tools-3-s4nnu.ondigitalocean.app`

Configuration files:

- `.do/staging.app.yaml` — `hnk-ai-tools-2` follows `upgrade-safe-wave` with `deploy_on_push: true`.
- `.do/app.yaml` — production follows `main` with `deploy_on_push: true`.
- `.github/workflows/deploy-digitalocean-staging.yml` — staging push workflow, manual API recovery, and live version + exact landing/app-content verification.
- `.github/workflows/deploy-digitalocean.yml` — production push workflow, manual API recovery, and live version + exact landing/app-content verification.
- `.github/workflows/verify-digitalocean-deploy.yml` — regression guard for both deployment lanes.

### One-time DigitalOcean source binding

For truly automatic deployments without storing a DigitalOcean API token in GitHub, each existing DigitalOcean app must be connected to the authenticated GitHub source once. **This migration is complete for both lanes as of 2026-08-17** — staging `hnk-ai-tools-2` and production `hnk-ai-tools-3` both follow their branches automatically.

Staging `hnk-ai-tools-2`:

```yaml
github:
  repo: hlaingkhay28047-svg/TG
  branch: upgrade-safe-wave
  deploy_on_push: true
```

Production `hnk-ai-tools-3`:

```yaml
github:
  repo: hlaingkhay28047-svg/TG
  branch: main
  deploy_on_push: true
```

The public one-click template intentionally uses a direct public-git source, so an app created from it does not auto-deploy later commits. Any such app must either be manually deployed from DigitalOcean after each approved branch update, or migrated once to authenticated GitHub (via the dashboard App Spec editor, replacing the `git:` block with the `github:` block above) the way both live lanes already were.

With the binding in place, normal pushes deploy directly from DigitalOcean. Each deploy workflow uses one shared 33-minute deadline across optional manual recovery and live verification, then verifies `/app/version.json` plus the SHA-256 of both live landing and app HTML against the checked-out commit. API force-rebuild is manual-only (`workflow_dispatch` with `force_rebuild: true`) so normal auto-deploys are never duplicated. Manual staging recovery requires `DIGITALOCEAN_STAGING_ACCESS_TOKEN`; manual production recovery requires the separate `DIGITALOCEAN_PRODUCTION_ACCESS_TOKEN`. Before mutation, the workflow verifies the actual DigitalOcean app uses the expected repository and lane branch.

No DigitalOcean access token is stored in repository files or logs.
