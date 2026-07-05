# WIVA Project Agent Guide

## Product Direction

WIVA is a local network live TV, IPTV, and media library agent for hotels, hospitals, cafes, campuses, and private networks. Treat WIVA as the public product name. Keep old Manara names only where they are required for migration compatibility.

The production desktop/runtime app lives in `electron-broadcaster/`. The root package is a workspace entry point only. Do not expand old root app code unless the task explicitly targets it.

The old root Lovable/TanStack/Supabase app was removed. Do not recreate root `src/`, `.lovable/`, or root `supabase/` unless the product direction explicitly changes.

## Source Of Truth

- Official runtime: `electron-broadcaster/`
- Official local web UI: `electron-broadcaster/webui/`
- Official packaged web output: `electron-broadcaster/webui/dist/`
- Official release package: `electron-broadcaster/package.json`
- Legacy UI paths exist only for fallback/migration and should not become normal product surfaces.

## Architecture Rules

- The desktop app should behave like a lightweight agent/tray shell.
- Normal setup, admin, library, viewer, device, IPTV, channel, theme, report, and update controls should live in the web admin.
- The modern web UI must be the source of truth for user-facing screens.
- Do not add new large HTML strings to server files when a React web UI route is the right place.
- Keep APIs and stream serving in the runtime/server layer.

## Security Rules

- Do not ship default admin credentials as a usable login.
- Do not store plaintext admin passwords.
- Do not put secrets, IPTV provider credentials, real private playlists, or unauthorized channel seed data in the repo.
- Admin mutation endpoints need authentication, narrow CORS, and protection against cross-site form/action abuse.
- Subscription and entitlement checks must fail closed for new paid installs.
- Viewer-facing errors should be clean and not expose provider credentials, internal paths, or subscription internals.

## UI And UX Rules

- WIVA UI is Arabic/RTL first, with English-safe structure where needed.
- Use Cairo typography across public and admin surfaces.
- Design mobile layouts deliberately. Avoid wide tables as the primary mobile experience.
- Public library must feel like a media product: folder-first browsing, clear artwork, polished empty/loading/error states, and no visible admin controls.
- Admin must feel like an operations dashboard: dense enough for work, but calm, organized, and touch-friendly.
- Every important page needs loading, empty, error, offline, blocked, and permission states when applicable.

## Streaming Rules

- IPTV must be on demand. Do not keep provider streams open when nobody is watching.
- For the same live stream and quality, use single ingest and multi-client distribution whenever technically possible.
- HLS segment requests should coalesce and cache safely.
- Track upstream internet usage separately from LAN downstream usage.
- Bound memory, handle slow clients, and clean inactive streams.
- Always document that 1000 viewers still require strong LAN bandwidth even if upstream internet is fetched once.

## Persistence And Windows Rules

- Settings changes must survive restart on Windows.
- Port, branding, setup completion, admin credentials, IPTV policy, media paths, and channel settings are persistent product state.
- Auto-start after login is not the same as before-login startup. Before-login startup needs a service or scheduled-task design.
- Use atomic writes or transactional storage for important local state.

## Release Rules

- Keep root and Electron versions in sync if the root package keeps a version.
- Run `npm --prefix electron-broadcaster run ci` before release-oriented changes.
- Stable releases are built by GitHub Actions from tags.
- Beta/pre-release artifacts should come from pull request automation.
- Do not publish a release with known broken setup/admin/library routes.

## Preferred Validation

- For runtime changes: `npm --prefix electron-broadcaster run test`
- For full checks: `npm --prefix electron-broadcaster run ci`
- For UI work: add or run browser/visual checks when available.
- For streaming work: include load or targeted stream tests when possible.

## Repo Hygiene

- Keep generated build output out of source unless the release architecture explicitly requires it.
- Keep sample fixtures safe and owned.
- Avoid new duplicate stacks, duplicate locks, or parallel UI systems.
- If a legacy compatibility path is retained, document why and how it will be removed.
