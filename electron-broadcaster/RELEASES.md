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

## v2.6.0

- Rebranded the packaged product, installer, icon, tray, desktop shell, setup, admin, and media library surfaces to WIVA.
- Converted the desktop UI into a lightweight WIVA Agent dashboard with setup/admin/library/live LAN URLs, diagnostics, restart, and update controls.
- Added a browser setup wizard for account placeholder, network details, logo upload, layout selection, port checks, theme selection, admin path, and admin credentials.
- Added setup and agent APIs: `/setup`, `/api/setup/state`, `/api/setup/save`, `/api/setup/port-check`, and `/api/agent/state`.
- Added WIVA assets to packaged builds so the taskbar icon and web logo are included.
