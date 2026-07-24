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

## v2.6.63

- Simplifies the mobile viewer by hiding desktop summary metrics and decorative cards so subscribers reach available content immediately.
- Keeps folder and media names visible and readable on small screens with polished two-line labels.
- Expands library search across all indexed sources, nested folders, and media instead of searching only the open folder.
- Improves Arabic search matching for common spelling variations, ranks exact and prefix matches first, and caches debounced results for responsive browsing.

## v2.6.62

- Keeps capture viewers registered while the hidden broadcaster recovers, allowing a replacement offer to arrive without tearing down and rebuilding the viewer WebSocket.
- Extends transient WebRTC disconnect tolerance from 6–8 seconds to 20–22 seconds so short Wi-Fi, encoder, or high-resolution load spikes do not become visible reconnect loops.
- Caps 1080p capture delivery at a stable 6Mbps while preserving Full HD resolution and the existing per-device adaptive quality controls.

## v2.6.61

- Stabilizes IPTV playback with a resilience-first HLS buffer, bounded retries, small-gap recovery, and fast restart when a provider segment stalls.
- Detects capture playback freezes, dropped frames, decoder stalls, packet loss, and excessive jitter so automatic quality can recover when video freezes while audio continues.
- Adapts HDMI sender bitrate, resolution, frame rate, and audio bitrate to the Windows host capacity and active viewer load before encoder pressure causes prolonged playback stalls.
- Keeps coalesced IPTV segment delivery responsive with TCP no-delay and verifies one upstream segment request across 1,000 simulated concurrent viewers.

## v2.6.60

- Adds an in-player mobile rotation control and automatic landscape orientation when fullscreen is supported, with a full-viewport fallback that keeps WIVA controls available on restricted browsers.
- Fixes pseudo-fullscreen stacking so the viewer header, page transitions, and mobile navigation cannot cover the video or intercept player controls.
- Verifies capture quality changes remain isolated per viewer and extends signaling load coverage through 500 and 1,000 simulated viewers.

## v2.6.59

- Reuses persistent upstream HTTP/HTTPS connections for IPTV playlists, segments, and raw streams, reducing repeated connection setup latency without keeping unwatched channels active.
- Adds provider response and first-video-byte latency measurements to IPTV runtime metrics and Arabic admin reports, making slow sources distinguishable from LAN delivery issues.
- Extends IPTV regression coverage to verify playlist and segment requests share one keep-alive connection while concurrent viewers still share one upstream segment request.

## v2.6.58

- Stabilizes automatic HDMI quality with repeated-loss confirmation, sustained recovery checks, and a 45-second upgrade cooldown so video does not bounce between 480p and 720p.
- Adds hysteresis to broadcaster capacity protection: viewer load must cross a higher threshold to reduce quality and a lower threshold to restore it, preventing join/leave oscillation.
- Makes IPTV adaptive bitrate upgrades more conservative by using longer bandwidth estimates while retaining fast degradation when playback is at risk.

## v2.6.57

- Streams HLS segment bytes to viewers as they arrive instead of waiting for the complete upstream segment, reducing IPTV black-screen and first-frame delay.
- Preserves one upstream request for concurrent viewers, replays already received chunks to late joiners, bounds retained segment memory, and disconnects slow LAN clients independently.
- Extends the HLS regression test to verify first-byte streaming and validates one-ingest delivery with 20, 100, 500, and 1,000 simulated concurrent viewers.
- Makes HDMI capture quality capacity-aware: the broadcaster retunes active senders as viewer load changes and reduces bitrate, resolution, and frame rate under heavy load instead of allowing unbounded encoder pressure.

## v2.6.56

- Moved library scanning and artwork enrichment into a background worker so startup, live playback, the admin panel, and viewer routes remain responsive while large folders are indexed.
- Added incremental media signatures, batched database writes, stale-file cleanup, live scan progress/cancellation, books and documents, broader local artwork discovery, and progressive video thumbnails.
- Added library download policy and rate controls, authenticated in-folder uploads, ten-second resume rewind, cleaner folder navigation, and removal of duplicated viewer search navigation.
- Prevented transient HDMI audio mute events and stale WebRTC peer events from repeatedly restarting capture playback; sustained audio failure and crashed capture renderers now recover automatically.
- Kept the desktop agent hidden until its renderer is ready and bundled critical home, live, library, and player screens in the initial viewer payload to avoid prolonged page preparation states.
- Reduced IPTV playlist and segment wait times, bounded HLS retries, and made the HLS player asset retryable after an initial load failure while preserving coalesced single-ingest segment caching.

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

## v2.6.53

- Replaced the unreliable cloud demo IPTV sources with tested low-bitrate direct playlists and kept all three cloud records active.
- Improved IPTV startup by beginning at the lowest HLS level, sizing quality to the player, coalescing concurrent requests, and caching static or target-duration playlists appropriately.
- Fixed false player timeouts when browsers block sound-on autoplay, while keeping the Play control visible and ready for a user gesture.
- Split viewer, setup, and admin screens into on-demand bundles so subscriber devices no longer parse the entire application at startup.
- Made library traversal asynchronous, coalesced overlapping scans, reused existing metadata, and cached artwork discovery to prevent large libraries from blocking live traffic.
- Added bounded TMDB lookup caching and timeouts, folder-name metadata matching, and automatic folder covers from local artwork or media metadata.
- Bundled an LGPL-compatible cross-platform FFmpeg executable to generate cached video-frame thumbnails when no poster or folder artwork exists.
- Added regression coverage for folder artwork precedence, generated thumbnails, web bundle splitting, cloud refresh deduplication, player startup, and HLS caching.

## v2.6.52

- Restored the complete public viewer visual design from v2.6.50 while preserving the newer streaming, security, SQLite, diagnostics, and startup-timeout fixes.
- Kept player controls visible on phones and touch devices during normal playback so tapping the video no longer makes the controls disappear.
- Made each newly opened player start unmuted with the saved non-zero volume; browsers that block audible autoplay show the clear play control so one tap starts playback with sound.
- Removed the extra v2.6.51 public-viewer style layer and returned the original home, live, guide, search, account, folder-library, header, cards, and navigation presentation.
- Improved navigation responsiveness without changing the design by removing slow animated scroll-to-top behavior, shortening page entrance animation, and caching viewer/library/folder queries between routes.
- Preserved clean player loading/error presentation and corrected nested-folder links in search results.

## v2.6.51

- Redesigned the subscriber home, live TV, guide, search, account, and folder-first library surfaces with a compact Arabic/RTL layout that works cleanly on mobile and desktop.
- Unified live and media playback behind the custom WIVA player with true fullscreen, contained video framing, keyboard controls, picture-in-picture, quality menus, touch zoom, persistent volume, and cleaner loading/error states.
- Added a bounded 15-second startup state for IPTV and capture playback so unavailable streams no longer leave subscribers on an indefinite loading screen.
- Simplified channel cards, removed duplicated quality/actions, fixed nested-folder search links, added recent searches, and reduced oversized empty states and mobile navigation.
- Hardened every authenticated admin mutation with same-origin validation and removed wildcard CORS from admin routes.
- Corrected IPTV health diagnostics so historical metrics are no longer counted as active streams after viewers disconnect.
- Added public-viewer layout and player regression tests, and validated single-ingest HLS delivery, 1,000-viewer signaling, Electron SQLite storage, and high-concurrency LAN requests.

## v2.6.50

- Added a custom WIVA player for live channels and media with accessible play/pause, volume, fullscreen, picture-in-picture, sharing, casting when supported, live state, and VOD seeking controls.
- Added per-viewer HDMI capture quality selection for automatic, 1080p, 720p, and 480p without restarting the capture source or changing other viewers.
- Made automatic HDMI quality device-aware and network-aware, with periodic WebRTC loss/jitter checks that lower weak clients to 480p while maintaining frame rate.
- Reduced false media buffering overlays by waiting for a sustained stall and showing compact recovery feedback after playback starts.
- Cached the packaged web shell and static assets in bounded memory, increased HTTP/WebSocket connection backlogs, enabled long-lived keep-alive, and hardened media Range validation.
- Expanded load coverage to the viewer, library browser, media Range streaming, 500-viewer IPTV segment coalescing, and 500-viewer capture signaling with live quality changes.
- Added the private `WIVA_TMDB_API_KEY` GitHub Secret to stable and beta Windows builds so network-owner library scans can retrieve TMDB artwork and metadata without exposing the key in source control.

## v2.6.49

- Changed capture channels to start on demand and stop shortly after the last viewer leaves, reducing idle CPU, memory, and capture-device usage. Channels explicitly configured for automatic start remain active.
- Added signaling regression coverage for on-demand capture startup and idle cleanup.
- Preserved brief WebRTC disconnects for several seconds before reconnecting, avoiding unnecessary HDMI playback interruptions caused by transient LAN state changes.
- Changed new HDMI/capture channels to clean direct audio with neutral gain, and made the historical balanced default pass clean digital audio through without unnecessary filtering.
- Tuned HLS playback for faster live startup, a smaller bounded browser buffer, and less intrusive recovery messaging after playback has started.
- Removed room-number wording from subscriber registration; the simple account flow now asks for name and phone number, with optional email.
- Ignored generated Next.js and TypeScript build artifacts so local production builds do not dirty the repository.

## v2.6.48

- Fixed capture-device discovery so a screen-capture error no longer hides USB video, camera, or audio devices from the web admin.
- Switched Windows PnP discovery to the reliable PowerShell execution path with a realistic timeout and broader USB/HDMI capture-device matching.
- Combined browser media-device IDs with Windows device names so saved capture channels use playable IDs while remaining easy to identify.
- Added screen/window thumbnails, explicit device refresh controls, clearer permission guidance, and regression coverage for all capture source groups.
- Added simple subscriber registration and sign-in, persistent sessions, account-backed favorites, watch progress, private message history, and network-owner message workflow.
- Added authenticated in-folder media uploads with streaming writes, source/exclusion boundary checks, immediate library updates, and admin audit logging.
- Fixed direct opening and refresh for account, favorites, search, and nested library routes on the unified live port.

## v2.6.47

- Reworked the public library browser so the root shows the contents of each added path, not the added drive/folder itself. Adding `D:\` now shows the folders and files under `D:\` to subscribers.
- Added a cached folder-browse index keyed by media revision, so moving between library folders no longer recalculates the entire media library on every click.
- Increased public library browser cache lifetimes and removed automatic source-jump behavior that made navigation feel like it was reloading.
- Kept local folder artwork as the preferred cover when both scanned media posters and local `cover/poster/fanart` files exist.
- Tuned the IPTV web player to reduce false "improving connection" overlays: buffering is now delayed, cleared on progress/canplay events, and HLS buffering is more tolerant for unstable LAN/provider conditions.

## v2.6.46

- Fixed the public IPTV player on the live port by forwarding the bundled HLS player asset through the signaling/front server, so browser playback no longer stays stuck on the connection-improvement loading state when HLS.js is required.
- Added smoke coverage to ensure `/hls.min.js` keeps working through the live port.
- Expanded media-library folder artwork detection with more common local media naming patterns, Arabic artwork names, additional image formats, and fallback image selection inside each folder.
- Added safe `/folder-art/:sourceId` serving for folder covers while respecting library source boundaries, excluded paths, and media entitlements.
- Allowed symbolic-link directories to behave like folders in the admin storage browser and public folder explorer.
- Kept TMDB scan keys in local/private config only and removed them from public agent settings payloads.
- Replaced raw activation/provider errors on setup with user-safe activation messages.

## v2.6.26

- Hardened admin setup: new installs no longer ship with a default admin password hash, first setup requires a strong admin password, and password changes reject weak values at the backend, not only in the UI.
- Removed the legacy base64 admin cookie fallback so admin access uses current sessions or valid Basic credentials only.
- Added port conflict validation before saving live/library/admin port changes, including the transition from unified to separate mode.
- Made unified mode actually avoid starting the separate library/admin server; separate mode starts it only when needed.
- Encrypted cloud IPTV cache URLs and headers at rest and stopped exposing cloud source URLs through public/admin channel lists.
- Allowed a valid zero-channel cloud IPTV response to clear the local cloud list instead of treating it as a failed refresh.
- Added regression coverage for custom ports and encrypted cloud IPTV cache behavior.

## v2.6.25

- Fixed port persistence after restart: valid custom ports like `8080` for live streaming and `8420` for library/admin are no longer treated as legacy defaults and reset back to WIVA defaults.
- Added a dedicated settings regression test so valid custom ports keep surviving settings normalization.
- Added after-login startup status reporting so the admin settings page shows whether the OS actually registered WIVA for login startup.

## v2.6.24

- Added a Windows before-login startup option controlled from the web admin settings. It creates a startup Scheduled Task for the WIVA Agent and keeps using the same WIVA data directory.
- Fixed live/library/admin port reporting after settings saves so the admin panel immediately returns the intended ports instead of stale running ports.
- Fixed port restarts: live server changes restart immediately, while library/admin port changes restart after the save response so the browser request is not cut off.
- Added unified/separate service layout controls in setup and web admin settings. Unified mode serves library/admin from the live port; separate mode uses the configured library/admin port.
- Added smoke coverage for port persistence, layout persistence, and before-login startup settings.

## v2.6.23

- Fixed partial settings saves so changing identity, ports, or other admin settings no longer resets the unified/separate experience layout or existing network metadata.
- Exposed `brandName`, `networkName`, and uploaded network logo data in Agent state so viewer, admin, and setup surfaces show the configured network identity after restart.
- Added PNG logo upload/removal in setup and the web admin branding page.
- Added IPTV cloud refresh controls in the IPTV admin page, backed by the persisted `/api/admin/iptv-policy` endpoint.
- Hardened IPTV policy updates so changing one policy field preserves the other.
- Added smoke coverage for persisted cloud IPTV refresh interval and transfer-limit policy.

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
