<p align="center">
  <img src="electron-broadcaster/assets/wiva.png" alt="WIVA" width="220" />
</p>

# WIVA Agent

WIVA is a local network live TV, IPTV, and media library agent for hotels, hospitals, cafes, campuses, and private networks.

The desktop app is intentionally lightweight: it runs the local services, shows the correct LAN URLs, handles updates, and keeps the tray icon alive. Setup, administration, live viewing, IPTV, reports, viewers, messages, and the media library are controlled from the browser.

## Default URLs

- Live TV: `http://<server-ip>:8787`
- Setup: `http://<server-ip>:8788/setup`
- Admin: `http://<server-ip>:8788/admin`
- Library: `http://<server-ip>:8788/library`

The setup wizard can change the ports and custom admin path.

## Main Capabilities

- Web-first setup wizard for network details, branding, layout, ports, themes, and admin access.
- WIVA Agent desktop shell with local/LAN links, diagnostics, update controls, and tray support.
- IPTV proxy with on-demand upstream fetching, HLS coalescing/cache, TS fan-out, transfer limits, errors, and analytics.
- Media library with nested sections, folders, upload/import, scans, subtitles, viewer accounts, favorites, watch later, and history.
- LAN admin panel for IPTV, broadcast channels, viewers, messages, blocklist, reports, logs, theme controls, media paths, upload, and health checks.
- GitHub Releases auto-update support.
- Sentry support when `SENTRY_DSN` is configured.

## Modern Web UI

The official viewer, admin, and setup experience is a modern single-page app in
`electron-broadcaster/webui/` (Next.js App Router static export + React +
TanStack Query + TypeScript). It is fully Arabic and right-to-left, ships local
Tajawal/Cairo fonts (no internet dependency), and is designed to work on phones,
desktops, and TVs across the LAN.

- The WIVA Agent (`library/media-server.cjs`) serves the built app from
  `webui/dist` and exposes only REST APIs, media/IPTV streams, and a live
  Server-Sent Events channel at `/api/live`.
- Server files no longer build large HTML pages. The modern web UI (the
  Next.js static shell in `webui/`) is the single user-facing surface;
  the old server-rendered admin panel, setup wizard, library, and player pages
  have been removed entirely. If `webui/dist` has not been built yet, the server
  returns a small offline-safe "UI not built" notice (HTTP `503`) instead of any
  legacy HTML. The only server-rendered HTML that remains is the admin login
  gate (needed for the login form POST). The old `/player/:id` URL now redirects
  to the SPA watch route (`/watch/media/:id`).
- Routes are real pages: viewer (`/`, `/live`, `/library`, `/watch/...`,
  `/search`, `/favorites`, `/account`), admin (`/admin/*`), and setup
  (`/setup/*`). Every screen has explicit loading, empty, and error states.

Develop the web UI:

```bash
cd electron-broadcaster/webui
npm install
npm run dev      # Next.js dev server for UI work
npm run build    # type-check + emit webui/dist
```

`npm --prefix electron-broadcaster run dist` (and `release`) build the web UI
automatically before packaging, and `webui/dist/**` is included in the app
bundle.

## Development

```bash
npm start
```

Run the smoke test:

```bash
npm test
```

The Electron runtime owns the correct native module ABI. If plain `node` reports a `better-sqlite3` ABI mismatch during local scripts, the app falls back to JSON storage for those checks; use Electron or run `npm --prefix electron-broadcaster run dev:repair-native` when native SQLite is required.

## Release

```bash
npm --prefix electron-broadcaster run release
```

The publish target remains the existing GitHub repository so installed apps can continue receiving updates.

## Documentation

- [Project audit](docs/AUDIT.md)
- [Security notes](docs/SECURITY.md)
- [Release flow](electron-broadcaster/RELEASES.md)
