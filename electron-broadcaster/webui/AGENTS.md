# WIVA Web UI Guide

## UI Source Of Truth

This is the official WIVA setup, admin, library, viewer, and player UI. Prefer implementing user-facing screens here instead of adding server-rendered HTML or expanding legacy renderer code.

The UI is a Next.js App Router static export. `npm run build` writes Next output
to `out/` and then copies it to `dist/`, which is what the Electron Agent serves
on the LAN. Keep routeable screen components under `src/screens/`; Next's
reserved `src/app/` directory should contain the static shell and client route
map only.

## Product Experience

- Arabic/RTL is first-class.
- Use Cairo typography everywhere.
- Public library and viewer pages should feel polished, visual, and media-native.
- Admin pages should feel like a professional network operations dashboard.
- Hide admin controls from public viewer/library pages.
- Keep wording clear and calm. Do not expose technical/provider internals to end users.

## Layout Rules

- Design mobile first for 320px to 430px widths, then scale up.
- Avoid wide tables on mobile. Use cards, stacked detail rows, accordions, sheets, or drill-in pages.
- Keep tap targets comfortable.
- Make filters and actions easy to reach on phone screens.
- Ensure text does not overflow buttons, cards, nav items, or player controls.

## Library Rules

- Folder browsing must preserve nested structure like a file explorer, Plex, Jellyfin, or Estraha-style media library.
- Show folders as folders first, then files/items inside the current section.
- Support loading, empty, missing drive/offline, scan running, and broken media states.
- Use generated or metadata artwork when available, with graceful fallback art.
- Viewer account actions should be simple: account, favorites, watch later, history, and message admin.

## Admin Rules

- Web admin should control channels, IPTV, media paths, scans, users/devices, themes, ports, updates, reports, and diagnostics.
- Forms should validate inline and preserve changes after restart.
- Destructive actions need confirmation and clear result feedback.
- Use safe labels for blocked viewers. Do not tell public viewers they are blocked.

## Player Rules

- IPTV/live players need loading, retry, reconnecting, no content, transfer limit, provider unavailable, and blocked states.
- Quality switching should be clear when multiple qualities exist.
- Player UI must work on mobile and desktop.
- Do not show private upstream URLs to normal viewers.

## Validation

- Add visual/browser coverage for new major screens when possible.
- Check Arabic RTL, mobile width, desktop width, empty state, and error state before considering UI work complete.
