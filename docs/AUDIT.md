# WIVA Project Audit

Date: 2026-06-25

## Current Stack

- Desktop application: Electron 39 with a CommonJS main process.
- Desktop packaging: electron-builder for Windows zip and NSIS installer.
- Auto-update: electron-updater using GitHub Releases.
- Local web server: Node `http` server embedded in the Electron app.
- Live/capture signaling: WebSocket server in `electron-broadcaster/server/signaling.cjs`.
- IPTV proxy: `electron-broadcaster/library/iptv.cjs`, including HLS request coalescing/cache and raw TS fan-out.
- Media library: local HTTP media server with Range support in `electron-broadcaster/library/media-server.cjs`.
- Local data: better-sqlite3 when native ABI is available, JSON fallback when not.
- Cloud database: Neon Serverless Postgres through `@neondatabase/serverless`.
- Platform activation/licensing: `electron-broadcaster/library/platform.cjs`.
- Cloud IPTV: Neon first, public/cloud fallbacks second.
- Error tracking: Sentry Electron if `SENTRY_DSN` is configured.
- Separate web app: TanStack/Vite source exists under `src/`, but the production desktop release currently uses the embedded Electron/local web server.

## Implemented

- WIVA visible branding, icon assets, installer name, shortcut name, tray tooltip, README, release metadata, and package name.
- Desktop app redesigned as a lightweight WIVA Agent with local/LAN URLs, status, updates, restart, and diagnostics.
- Default ports changed away from 8080: live `8787`, setup/admin/library `8788`.
- Browser setup wizard at `/setup`.
- Network setup fields: network name, number, country, city, location, timezone.
- PNG logo upload preview and local persistence.
- Unified vs separate layout setting.
- Live/library/admin port configuration with OS-level port checks where supported.
- Theme selection fields.
- Custom admin path support with `/admin` compatibility.
- Web admin panel for IPTV, library paths, scans, uploads, users/messages, blocklist, logs, analytics, reports, and broadcast JSON.
- Public media library with viewer accounts, favorites, watch later, history, and messages.
- IPTV on-demand proxy and grouped quality options.
- Service health endpoint: `/health`, `/ready`, `/api/agent/health`.
- Admin login rate limiting and opaque server-side sessions.
- Admin password hashing for new/migrated settings.
- GitHub release workflow for Windows artifacts.
- Smoke test for setup, health, admin login, session cookies, and protected admin state.
- End-to-end test suite (`scripts/e2e-test.cjs`) covering public pages, viewer accounts, admin endpoints, IPTV, and reports.
- Cinematic media player with resume, subtitle track cycling, playback speed, Picture-in-Picture, theater mode, auto-play-next, and keyboard shortcuts.

## Partially Implemented

- Neon platform activation and feature entitlement checks exist, but full Neon Auth organization membership is not complete.
- Seven-day trial concepts exist in platform/licensing code, but complete server-side configurable trial lifecycle and platform UI are not complete.
- Mandatory update policy data exists, but hard app blocking before launch is not fully enforced.
- IPTV multi-viewer optimization exists for HLS segments and TS fan-out, but 1000-viewer production hardening still needs load testing and backpressure tuning.
- Media library supports folders and scanning, but thumbnail generation from video frames and full TV-grade detail pages are not complete.
- Admin UI is functional and WIVA-branded, but full role-based product IA is not complete.
- The `src/` web app has many routes but is not the primary packaged desktop runtime.

## Not Implemented Yet

- Full Neon Auth email/password and Google OAuth flow with production secrets and redirect configuration.
- Password reset and email verification through Neon Auth.
- Server-side role-based authorization across platform and network admin areas.
- WIVA Platform Admin UI for organizations, installations, trials, suspensions, releases, and audit logs.
- Complete multi-tenant Neon schema migration covering all requested entities.
- Signed entitlement tokens resistant to client-side clock/file manipulation.
- Background-removal service for uploaded logos.
- EPG/program guide ingestion.
- Capture-device management UI and health diagnostics beyond existing WebRTC capture signaling.
- Automated browser accessibility tests and full mobile visual regression suite.
- Windows Service mode for before-login startup.
- Code signing certificate integration.
- Full rollback implementation for failed auto-updates.

## Compatibility Names That Remain

Some internal names remain for safe upgrades:

- GitHub repository: `Alwahdi/manara-broadcaster`, so installed apps continue to receive updates from the same feed.
- Environment variables: `MANARA_NEON_DATABASE_URL` and related legacy names, because release workflows and cloud runtime configuration already use them.
- Local data filenames such as `manara-channels.json`, to avoid losing existing customer data.
- Some internal log prefixes in older storage modules.

These are not customer-facing product names.

## Current Risks

- Full SaaS security depends on completing Neon Auth, RBAC, tenant isolation, and signed entitlements.
- Plain Node smoke tests may use JSON fallback if `better-sqlite3` was built for Electron ABI. The packaged Electron app rebuilds the native module during packaging.
- Electron dependency audit currently reports transitive vulnerabilities. They should be reviewed before broad production rollout; do not blindly force major upgrades without packaging tests.
- LAN admin is appropriate for trusted local networks, but not for public internet exposure.

## Recommended Next Phases

1. Complete Neon Auth and organization membership model.
2. Add signed entitlement/trial model with server-side validation.
3. Split Network Admin and WIVA Platform Admin into clear role-protected areas.
4. Add disk/byte-limited HLS cache, stronger backpressure, and load tests.
5. Add browser E2E, accessibility, and mobile screenshots.
6. Add video thumbnail generation and richer media detail pages.
7. Add Windows Service/scheduled-task mode for before-login startup.
8. Add code signing and documented update trust policy.
