# WIVA Production Hardening Plan

This document tracks the production-readiness work for WIVA Agent and separates code changes from external secrets/certificates that must be provided by the product owner.

## Current branch

Work is staged on `hardening-ci-foundation` before merging to `main`.

## Implemented in this foundation pass

- Root `package.json` is now a workspace entrypoint only. The production Electron runtime remains under `electron-broadcaster/`.
- Added `npm run ci` for smoke tests, Web UI typecheck/build, and production dependency audit.
- Added `npm run test:load` as a local API load-test baseline.
- Added `.github/workflows/ci.yml` with:
  - Linux smoke test.
  - Linux local API load baseline.
  - Web UI build/typecheck.
  - production dependency audit.
  - Windows package dry run with `electron-builder --publish never`.

## Required secrets before full production release

Set these in GitHub repository secrets or the deployment environment:

| Secret | Required for | Notes |
| --- | --- | --- |
| `MANARA_NEON_DATABASE_URL` | Neon-backed platform, cloud IPTV, licensing | Keep the legacy name until migration is finished. |
| `SENTRY_DSN` | Error tracking | Optional but recommended for production. |
| `GOOGLE_OAUTH_CLIENT_ID` | Google sign-in | Required when Neon/Auth Google OAuth is enabled. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google sign-in | Required when Neon/Auth Google OAuth is enabled. |
| `WINDOWS_CERTIFICATE_BASE64` | Windows code signing | Base64-encoded `.pfx` certificate. |
| `WINDOWS_CERTIFICATE_PASSWORD` | Windows code signing | Password for the `.pfx` certificate. |

## Production blockers still open

### Authentication and tenancy

- Complete Neon Auth email/password flow.
- Complete Google OAuth redirect configuration.
- Add organizations table and membership model.
- Enforce server-side RBAC on every platform/admin route.
- Split WIVA Platform Admin and Network Admin permissions.

### Licensing and entitlement security

- Replace client-trust license checks with signed server-issued entitlement tokens.
- Include tenant id, installation id, hardware id, plan, feature flags, issued-at, expiry, and signature.
- Validate signed entitlements locally with offline grace.
- Store last-known-good entitlement with tamper-resistant checks.

### IPTV and stream performance

- Add disk/byte-limited HLS cache.
- Add backpressure policies for slow viewers.
- Add stream fan-out metrics.
- Raise the load baseline from API-only checks to real HLS segment tests.
- Test on the real target hardware and LAN switch, not only GitHub Actions.

### Windows production quality

- Add Windows code signing once certificate secrets exist.
- Add rollback policy for failed updates.
- Add Windows Service or Scheduled Task mode for before-login startup.
- Document firewall rules and LAN-only exposure.

### Quality gates

- Add Playwright E2E tests for setup, admin, viewer, and mobile viewport.
- Add accessibility checks for Arabic RTL pages.
- Add visual regression screenshots for TV/mobile/desktop.
- Add release checklist before tagging `v*`.

## LAN exposure policy

The embedded admin server is intended for trusted LAN use. Do not expose it directly to the public internet. If remote administration is required, put it behind a hardened reverse proxy/VPN with HTTPS, rate limiting, IP restrictions, and strong authentication.

## Recommended next implementation order

1. Merge CI foundation after it passes.
2. Add signed entitlement module and tests.
3. Add Neon organization/membership schema migration.
4. Add route-level RBAC middleware.
5. Add Playwright E2E tests.
6. Add Windows signing after certificate secrets are ready.
