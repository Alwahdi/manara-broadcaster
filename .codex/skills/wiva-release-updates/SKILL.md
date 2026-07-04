---
name: wiva-release-updates
description: Use when changing WIVA versions, GitHub Actions releases, beta builds, electron-updater behavior, mandatory updates, release notes, CI checks, and installer packaging.
---

# WIVA Release And Updates Skill

## Source Of Truth

`electron-broadcaster/package.json` is the packaged app manifest. If the root `package.json` keeps a version, it must stay in sync.

## Release Rules

- CI should build stable Windows releases from tags.
- PR beta builds should publish pre-releases only for safe same-repo PRs.
- Do not release with broken setup/admin/library/player routes.
- Do not release with mismatched versions.
- Update release notes for user-facing changes and security hardening.

## Mandatory Updates

- Mandatory updates should block protected app functionality before normal access.
- Optional updates should not block.
- Update errors need clear recovery messages.
- Test optional, mandatory, failed download, and up-to-date states.

## Validation

- Run `npm --prefix electron-broadcaster run ci` before release changes.
- Inspect GitHub Actions annotations and release assets after publishing.
