# WIVA Electron Runtime Guide

## Runtime Ownership

This folder contains the production WIVA Agent. Changes here affect packaged Windows builds and local LAN behavior.

Key areas:

- `main.cjs`: Electron lifecycle, settings, tray, startup, updates, capture integration.
- `library/media-server.cjs`: LAN HTTP server, setup/admin/library/viewer APIs, media serving.
- `library/iptv.cjs`: IPTV proxy, HLS handling, TS fan-out, provider error handling.
- `library/db.cjs`: local persistence and migration behavior.
- `webui/`: official modern admin/viewer/library/setup UI.

## Main Process Rules

- Keep the desktop shell lightweight. It should expose health, links, restart/update controls, and tray behavior.
- Do not rebuild full admin workflows in the desktop renderer.
- Settings updates must be sanitized before saving.
- Never persist plaintext admin passwords.
- When changing startup behavior, distinguish tray startup, login startup, and before-login service mode.

## Media Server Rules

- Server code should expose APIs, streams, static assets, and fallback pages only.
- Prefer adding user-facing screens to `webui/`.
- Admin APIs must require admin authentication.
- Avoid wildcard CORS for admin APIs.
- Keep viewer errors descriptive but safe.
- Do not leak local filesystem paths or private upstream URLs to normal viewers.

## IPTV Rules

- IPTV starts only on viewer demand.
- Multiple viewers of the same stream/quality should share upstream work.
- HLS segments should be coalesced and cached with bounded memory.
- Provider errors must map to useful safe messages: forbidden, missing, no content, unavailable, transfer limit, timeout.
- Track upstream bytes, downstream bytes, cache hits, active viewers, and provider errors when adding analytics.

## Persistence Rules

- Use the existing DB/settings helpers instead of ad hoc writes.
- Protect Windows saves with atomic writes or transactional DB operations. Use `writeJsonAtomic` from `library/atomic-write.cjs` (fsync + retry on Windows file locks) — do not hand-roll temp+rename writes.
- Preserve migrations from old Manara paths/names unless a migration issue explicitly removes them.
- Do not delete media library records just because a drive is temporarily offline.
- The media library uses SQLite (`better-sqlite3`) when available and only falls back to JSON when the native module cannot load. `db.diagnostics()` reports the active backend (`sqlite` / `json-fallback` / `recovery`), the exact load/init failure cause, and an admin recovery action. Production must not silently run in JSON fallback — surface it in the admin Diagnostics screen.
- When SQLite becomes available after a JSON-fallback run, `db.init()` migrates the fallback media data back into SQLite (recovery mode) and keeps the old file as `*.media.json.migrated`.

## Release And Packaging Rules

- `electron-broadcaster/package.json` is the packaged app manifest.
- `npm run dist` and `npm run release` must build `webui` first.
- Keep icon/assets included in packaged builds.
- Do not add unauthorized IPTV seed data or provider credentials to `scripts/`.

## Validation

- Run `npm --prefix electron-broadcaster run test` for logic/runtime changes. This includes `persistence-test.cjs`, which simulates a restart and the JSON-fallback → SQLite recovery/migration path.
- Run `npm --prefix electron-broadcaster run ci` for release-facing changes.
- Run `npm --prefix electron-broadcaster run test:native` to verify `better-sqlite3` loads and completes a read/write round-trip. The Windows packaging CI job runs this before building the installer so a broken native DB build is caught early.
- For native SQLite issues, use `npm --prefix electron-broadcaster run dev:repair-native` when needed.
