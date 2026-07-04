---
name: wiva-media-library
description: Use when improving WIVA media library scanning, folder browsing, nested sections, url.txt support, subtitles, thumbnails, metadata, watch history, favorites, and library admin controls.
---

# WIVA Media Library Skill

## Product Goal

The media library should feel like a polished local media system: folder-first browsing, clear artwork, smooth player, and admin-controlled scanning/imports.

## Rules

- Preserve folder hierarchy. Do not flatten the library unless a specific view asks for it.
- Show folders first, then media files/items inside the selected folder.
- Keep disconnected drives visible as offline instead of deleting content.
- Support sidecar subtitles and browser-safe subtitle formats.
- Generate thumbnails when metadata artwork is missing.
- Keep favorites, watch later, history, and messages server-side where possible.

## Workflow

1. Inspect scanner behavior and DB models before changing UI.
2. Keep scan/import/admin controls in web admin.
3. Make public library mobile-first and RTL-polished.
4. Add diagnostics for missing files, broken subtitles, unsupported formats, and thumbnail failures.
5. Validate scan results and folder navigation with nested test media.
