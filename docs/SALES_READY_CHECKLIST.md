# WIVA Sales Ready Checklist

This checklist is the gate before giving WIVA to a paying customer. It separates what must pass before a normal installation from larger platform work that remains a commercial blocker.

## Must Pass For Every Customer Install

- The Windows installer opens WIVA Agent and shows working LAN links.
- Setup completes once, survives restart, and redirects to admin after completion.
- Admin password is created by the owner and is not a shipped default.
- Branding name/logo, live port, library/admin port, and unified/separate layout survive restart.
- Public viewer routes work on phone and desktop: `/`, `/live`, `/live/guide`, `/library`, `/library/folders`, `/search`, `/favorites`, `/account`, `/watch/channel/...`, `/watch/media/...`.
- Public viewer has no technical/admin/server wording and no fake buttons.
- Live channels appear only when enabled and playable.
- IPTV channels hide private URLs from subscribers.
- Library browsing remains folder-first and does not expose raw system paths to subscribers.
- Admin can add/edit/delete broadcast channels, IPTV channels, and library folders.
- Reports, diagnostics, logs, viewers, and messages show real data or a clear owner-facing empty state.
- Auto-update detects stable releases and does not erase local settings.
- `npm --prefix electron-broadcaster run ci` passes before tagging a stable release.

## Commercial Blockers Before Broad Sale

- Windows code signing is not configured until certificate secrets are available.
- Full Neon Auth email/password, Google OAuth, password reset, and email verification are not complete.
- Signed server-issued entitlements with offline grace are not complete.
- Role-based access control and multi-tenant isolation tests are not complete.
- Real 100/500/1000 viewer stream load tests on target LAN hardware are not complete.
- HLS disk/byte-limited cache and stronger slow-client backpressure still need production hardening.
- Full rollback for failed updates is not implemented.
- Playwright visual/accessibility regression coverage is not complete.

## Subscriber Experience Gate

- Arabic/RTL layout is polished at 320px, 390px, 430px, tablet, desktop, and TV-like widths.
- Bottom navigation uses real icons and Arabic labels.
- Empty/loading/error states are friendly and non-technical.
- Search covers live channels, library files, and library folders.
- Folder breadcrumbs use clean names such as `المكتبة / أفلام / أكشن`.
- Player errors say only simple messages such as `تعذر تشغيل البث الآن` and never expose provider details.

## Owner Experience Gate

- Dashboard clearly shows what is running, what needs attention, and the LAN links.
- Common actions are obvious: add channel, import IPTV, add library folder, scan library, update branding, export reports, change ports.
- Destructive actions require confirmation.
- Admin pages are usable on mobile without relying only on wide tables.
- Security page explains LAN-only deployment and strong password requirements.

## Release Decision

Release as `stable` only when all "Must Pass" items are verified. If any commercial blocker remains, mention it in internal docs/release notes for the owner/operator, not in public subscriber UI.
