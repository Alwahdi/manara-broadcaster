# WIVA release flow

The Windows app uses `electron-updater` with GitHub Releases.

To publish an update:

1. Bump `electron-broadcaster/package.json` version.
2. Commit the change.
3. Tag the same version, for example `v2.6.0`.
4. Push the branch and tag.

GitHub Actions builds the Windows installer/zip and publishes the release files.
Packaged apps check for updates on startup and every 6 hours. The WIVA Agent
window also includes a manual update check and install button when an update is
ready.

## Beta (pre-release) builds for pull requests

Every pull request that targets the repository (from a branch in this repo, not a
fork, and not a draft) automatically produces a **beta pre-release** via the
`PR Beta Release` workflow (`.github/workflows/pr-beta-release.yml`).

- The version is derived from `electron-broadcaster/package.json` with a beta
  suffix: `<version>-beta.<pr-number>.<run-number>` (for example
  `2.6.13-beta.42.7`).
- Artifacts are published to GitHub Releases as a **pre-release** using
  `npm run release:beta`, so testers can install the exact changes under review
  before they are merged and promoted to a stable release.
- The workflow uses a per-PR concurrency group, so pushing new commits cancels
  the previous beta build and only the newest one is kept.

Because betas use a pre-release SemVer tag (with a `-beta` component), they are
never offered as automatic updates to users on stable channels.

## Windows saving reliability

All persisted JSON stores (channels, admin state, media fallback, platform
cache, and cloud IPTV cache) are written through `library/atomic-write.cjs`. It
writes to a temp file, `fsync`s it, then renames it over the destination with
retry/backoff, and finally writes in place if Windows keeps the destination
locked (antivirus, Search indexing, backup agents). This eliminates the
intermittent "cannot save on Windows" failures that the old
`writeFile` + `rename` pattern caused.

## v2.6.15

- Hid the legacy admin and setup UI behind the emergency-only `WIVA_ALLOW_LEGACY_UI` flag so the modern web UI is the only normal product surface.
- Removed visible legacy UI links from the modern admin panel.
- Added smoke coverage that proves `/admin/legacy` and `/setup/legacy` are blocked by default and only reopen when the emergency flag is set.
- Cleaned the repo by removing the unused Lovable/root web stack and public demo IPTV seed files.
- Added WIVA agent guidance and Codex skills for future UI, streaming, media library, release, and ops work.

## v2.6.14

- Fixed ambiguous admin byte-size rendering so actual usage and media sizes show as real data amounts such as `0 B`, while transfer limits still show `بدون حد` when unlimited.
- Added shared server-side format helpers and unit coverage for data sizes, transfer limits, and durations.
- Improved admin diagnostics and reports with Arabic metric labels, friendlier system values, and safer empty-state handling.
- Made viewing CSV exports Windows/Excel-safe with UTF-8 BOM and CRLF line endings so Arabic text opens correctly.
- Synced the root workspace version with the packaged Electron app version.

## v2.6.13

- Added Windows-safe atomic saving (`library/atomic-write.cjs`) with retry, backoff, and in-place fallback so channel, admin-state, media, platform, and cloud IPTV saves no longer fail intermittently on Windows due to file locks.
- Added a `PR Beta Release` GitHub Actions workflow and `release:beta` script that publish a beta pre-release Windows build for every pull request.

## v2.6.6

- Added a bundled WIVA media asset pack for folders, sources, video, audio, image, live, link, PDF, APK, EXE, and the media library hero.
- Served bundled media artwork through `/library-assets/*` so the LAN library looks polished without internet or TMDB artwork.
- Improved the runtime media library with richer folder/file cards, fallback artwork, and stronger Arabic mobile layout rules.
- Improved the LAN admin mobile experience with a bottom navigation bar, touch-friendly controls, better modal sizing, and scrollable tables.
- Reworked the React media library into a source/folder-first experience using the same WIVA artwork style.
- Improved the React admin shell mobile navigation and polished library path management into source cards with clearer stats and actions.
- Applied Cairo-first typography consistently across viewer, player, agent, and admin surfaces.

## v2.6.5

- Changed the runtime media library to open in a true folder-first browser: source/drive first, then folders, subfolders, and files with breadcrumbs, back navigation, and grid/list modes.
- Added source metadata to scanned media so every item keeps its library source, source label, relative path, and original folder structure.
- Hardened scans for external drives: disconnected or permission-blocked sources are marked as unavailable and their existing library items are preserved instead of deleted.
- Limited missing-file cleanup to the source that was successfully scanned.
- Added scan reports with source status, folder counts, unsupported counts, and permission/disconnection details.
- Added clearer admin API aliases for capture and filesystem browsing workflows.

## v2.6.4

- Added LAN admin capture-source discovery for screens, windows, and Windows AV/capture devices, with clearer source testing and advanced manual fallback.
- Reworked library path management into a browser-style drive/folder picker with validation, previews, connected/disconnected status, file counts, and last scan details.
- Added a public media library folder-tree view with breadcrumb navigation so folders and subfolders stay organized instead of being flattened.
- Improved admin API error handling so invalid paths and failed actions show clear Arabic guidance.
- Continued WIVA UI/UX polish across admin, library, player, live, and agent surfaces.

## v2.6.0

- Rebranded the packaged product, installer, icon, tray, desktop shell, setup, admin, and media library surfaces to WIVA.
- Converted the desktop UI into a lightweight WIVA Agent dashboard with setup/admin/library/live LAN URLs, diagnostics, restart, and update controls.
- Added a browser setup wizard for account placeholder, network details, logo upload, layout selection, port checks, theme selection, admin path, and admin credentials.
- Added setup and agent APIs: `/setup`, `/api/setup/state`, `/api/setup/save`, `/api/setup/port-check`, and `/api/agent/state`.
- Added WIVA assets to packaged builds so the taskbar icon and web logo are included.

## v2.6.1

- Hardened local admin authentication with hashed passwords, opaque sessions, and login rate limiting.
- Added WIVA service health/readiness endpoints.
- Added baseline browser security headers.
- Added a smoke test for setup, health, admin login, session cookies, and protected admin APIs.
- Added audit, security, and environment documentation.

## v2.6.2

- Redesigned the public media library with a cinematic WIVA hero, premium Arabic/RTL styling, folder-first browsing, quick filters, polished cards, fresh/progress badges, and mobile-oriented layout rules.
- Moved viewer sign-in into an optional account drawer so the library stays clean and does not show admin controls to viewers.
- Improved media library interactions for account access, quick filter state, timestamp sorting, favorites/watch later controls, and section/folder browsing.
- Refreshed the public media player visual style to match the WIVA library experience.
- Polished the LAN admin panel surfaces, actions, tables, and navigation without changing its management behavior.

## v2.6.3

- Applied Cairo typography across the WIVA agent, public live/player pages, media library, setup, and LAN admin surfaces.
- Simplified public viewer accounts to name plus phone/room number with optional email, and preserved those details in admin messages.
- Reworked media library folder browsing into direct folder cards with sidecar/folder artwork support.
- Added structured LAN admin controls for broadcast channels instead of raw JSON editing.
- Added configurable cloud IPTV refresh policy, defaulting to every 3 minutes, and exposed IPTV policy/status in admin APIs.
