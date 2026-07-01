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
