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

## v2.6.22

- Preserved selected broadcast audio device names when creating/editing capture channels, so Windows devices can be matched more reliably during playback.
- Added full web admin CRUD for broadcast channels: create, read, edit, enable/disable, and delete.
- Added full web admin CRUD for local IPTV channels, while keeping cloud IPTV protected with enable/disable controls.
- Added `/api/library/browse` and switched the viewer library to folder-first browsing based on the real library source path and nested `relative_path` values.
- Improved the library folder UI with source folders, breadcrumbs, folder/file cards, offline state, and mobile-friendly responsive sizing.
- Added optional cached video thumbnail generation during library scans when `ffmpeg` is available, so folders/files can use real video frame artwork without writing into user media folders.
- Expanded smoke coverage for broadcast audio metadata, channel edits, IPTV edits, viewer visibility, and nested media-library folder browsing.

## v2.6.21

- Fixed cloud IPTV visibility for viewers by making active cloud IPTV channels enabled by default unless the local admin explicitly disables them.
- Added an internal hidden WebRTC broadcaster for enabled capture/screen/window channels so viewer-side live channels have an actual sender and no longer stay stuck reconnecting.
- Restarted/reconciled live channel broadcasters automatically after channel changes, settings saves, live-port restarts, and subscription refreshes.
- Allowed the Agent's internal broadcaster windows to access media/display capture permissions needed for local live channels.

## v2.6.20

- Fixed the media library API payload so the new web UI receives `items` and `media`, with poster/backdrop URLs and online/offline state for each item.
- Fixed viewer live-channel state so saved capture/broadcast channels are exposed to `/live` and open through the correct WebRTC player path instead of being treated like IPTV.
- Fixed cloud IPTV admin/viewer mismatch by applying the same local enable/disable overrides in admin state, IPTV admin lists, and viewer state.
- Added cloud IPTV enable/disable support from the web admin API and UI.
- Added smoke coverage for library visibility, broadcast channel visibility, local IPTV visibility, and cloud IPTV activation.

## v2.6.19

- Fixed viewer live channel data so enabled IPTV channels appear in `/live` and `/api/viewer/state`, alongside local broadcast/capture channels.
- Separated live/IPTV route entitlement from media-library entitlement so IPTV can show even when the media library feature is not enabled.
- Fixed admin port saving from the web UI by mapping live/admin port fields to the persisted Agent ports and restarting services after save.
- Simplified media library source management: admins can paste a folder/drive path, add it, and trigger a scan directly.
- Added smoke coverage for IPTV visibility in viewer state and library source add/scan behavior.

## v2.6.18

- Replaced the Vite/TanStack Router web UI shell with a Next.js App Router static export that still builds into `webui/dist` for the Electron Agent.
- Added a small WIVA client navigation layer so `/admin/*`, `/setup/*`, `/library`, `/live`, and `/watch/*` continue to work without running a Next server.
- Fixed the mobile RTL admin drawer so the hamburger menu opens inside the viewport and closes after navigation.
- Added a platform registration gate: unregistered installs now see registration first, pending installs wait for owner approval, and admin/viewer routes only open after an active subscription.
- Added LAN platform activation/refresh APIs so registration requests are written through the owner Neon platform table instead of staying local-only.
- Hardened web UI install/build scripts with deterministic `npm ci --ignore-scripts --no-audit --no-fund` before typecheck/build.

## v2.6.17

- Removed the legacy server-rendered UI entirely: `adminPage()`, `setupPage()`, the library page, and the player page are gone, along with the `/admin/legacy` and `/setup/legacy` routes and the `WIVA_ALLOW_LEGACY_UI` flag. The Vite + React web UI (`webui/dist`) is now the single user-facing surface.
- When `webui/dist` is not built, the server returns a small offline-safe "UI not built" notice (HTTP `503`) instead of any legacy HTML. The admin login gate is the only server-rendered HTML that remains.
- Made all remaining server-rendered notices (admin login, feature-gate, stream-blocked, UI-not-built) fully offline-safe: removed the Google Fonts CDN import and switched to a Cairo-first local/system font stack so pages render correctly on isolated LANs.
- The old `/player/:id` watch URL now redirects to the modern SPA route `/watch/media/:id` so lingering bookmarks keep working.
- CI now builds the web UI before the smoke test, and the smoke test verifies the legacy admin/setup markup is gone (serving the SPA shell when built, or the offline-safe notice when not).

## v2.6.16

- Merged PR #34 as a release checkpoint for the customization and media library workstream.
- No runtime files changed in PR #34; this release keeps the v2.6.15 app behavior and refreshes the stable update channel metadata.

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
