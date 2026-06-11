# Manara release flow

The Windows app uses `electron-updater` with GitHub Releases.

To publish an update:

1. Bump `electron-broadcaster/package.json` version.
2. Commit the change.
3. Tag the same version, for example `v2.5.0`.
4. Push the branch and tag.

GitHub Actions builds the Windows installer/zip and publishes the release files.
Packaged apps check for updates on startup and every 6 hours. The Settings screen
also has a manual update check button.
