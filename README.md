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
