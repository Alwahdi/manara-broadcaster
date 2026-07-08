# WIVA Release Checklist

Use this checklist before tagging a stable `v*` release.

## Version

- Root `package.json` version matches `electron-broadcaster/package.json`.
- Release notes mention user-facing changes, security hardening, and known blockers.
- No private IPTV credentials or unauthorized seed data are committed.

## Local Validation

Run from the repository root:

```bash
npm --prefix electron-broadcaster run test
npm --prefix electron-broadcaster run typecheck:webui
npm --prefix electron-broadcaster run ci
```

For UI-heavy releases also run or perform:

- Public viewer copy guard.
- Mobile 320/390/430px visual check.
- Desktop admin visual check.
- Setup first-run check.
- Player loading/error/reconnect check.

## Packaging

Run:

```bash
npm --prefix electron-broadcaster run dist
```

Verify:

- NSIS installer starts.
- ZIP build starts.
- App icon appears in taskbar/tray.
- `webui/dist` is included.
- Setup/admin/library/player routes load.
- Settings survive restart.

## GitHub Release

1. Commit all changes.
2. Push to `main`.
3. Create and push tag:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

4. Watch the `Release Windows App` workflow.
5. Confirm the GitHub release is not draft.
6. Download the installer from the release and smoke test it.

## Update Validation

- Install previous stable release.
- Confirm it detects the new release.
- Confirm update does not erase settings, branding, ports, channels, IPTV policy, or library folders.
- If the update is mandatory, confirm protected functionality is blocked until updated.
- If update download fails, confirm the owner sees a clear recovery message.

## Release Blockers

Do not publish as broadly sellable if any of these are newly broken:

- Setup cannot complete.
- Admin login/session is broken.
- Public viewer exposes technical/admin/server wording.
- Live/IPTV/library routes are broken.
- Port/settings persistence regressed.
- CI fails.
- Windows package fails.

## External Commercial Blockers

These may remain documented blockers until provided/implemented:

- Windows code signing certificate.
- Full Neon Auth / Google OAuth.
- Signed entitlement token service.
- Full rollback system.
- 100/500/1000 viewer real load validation.
