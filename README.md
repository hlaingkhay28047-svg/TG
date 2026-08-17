# TG

Adobe Photoshop plugin tools and HNK web app.

## Always-live upgrade flow

Every upgrade should have a live DigitalOcean copy automatically:

1. Work on `upgrade-safe-wave`.
2. Every push to `upgrade-safe-wave` runs GitHub CI and updates DigitalOcean staging `hnk-ai-tools-2`.
3. Review and test the staging live app while development continues.
4. Merge the approved upgrade to `main`.
5. Every push/merge to `main` updates DigitalOcean production `hnk-ai-tools-3` and verifies `/app/version.json` matches the repository release.

This keeps both GitHub and DigitalOcean moving together while still separating unfinished staging code from the production app.

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

For truly automatic deployments without storing a DigitalOcean API token in GitHub, each existing DigitalOcean app must be connected to the authenticated GitHub source once.

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

The public one-click template intentionally uses a direct public-git source, so it does not auto-deploy later commits. Until an existing app is migrated to authenticated GitHub, manually deploy it from DigitalOcean after each approved branch update.

After that one-time binding, normal pushes deploy directly from DigitalOcean. Each deploy workflow waits up to 30 minutes, then verifies `/app/version.json` plus the SHA-256 of both live landing and app HTML against the checked-out commit. API force-rebuild is manual-only (`workflow_dispatch` with `force_rebuild: true`) so normal auto-deploys are never duplicated. Manual staging recovery requires `DIGITALOCEAN_STAGING_ACCESS_TOKEN`; manual production recovery requires the separate `DIGITALOCEAN_PRODUCTION_ACCESS_TOKEN`. Before mutation, the workflow verifies the actual DigitalOcean app uses the expected repository and lane branch.

No DigitalOcean access token is stored in repository files or logs.
