# Browser IPTV playback

The viewer requests `/iptv/:id/playback.m3u8` behind the existing entitlement,
channel, blocklist and transfer-limit checks. Provider URLs and headers remain
on the server.

On first demand, bundled FFmpeg inspects the source through the existing
accounted loopback IPTV proxy, with a 20-second deadline. Concurrent viewers
share inspection. Successful metadata is cached for five minutes; empty/failed
results are not cached. H.264/AAC HLS keeps the original coalesced proxy path.
Failed refreshes preserve the last successful playlist's original stale deadline;
they cannot extend an old live playlist indefinitely. Empty playlists are rejected
before caching, while a still-valid previous playlist can bridge a brief outage.
Other video codecs convert to H.264/yuv420p, at most 1280x720 and 25 fps, with AAC
stereo audio. H.264 with incompatible audio or raw TS input remuxes without video
encoding. `compat=1` forces video conversion if the browser still cannot decode.

Each source/channel/header combination shares one worker. Source edits stop old
workers and create unique segment generations. At most four inspections/workers
run simultaneously; overload returns retryable 503. Workers stop after 60 seconds
without playlist/segment requests, on failure, or 45 seconds without output.
Paused viewers may need to reconnect after the idle grace period.

Converted output uses two-second HLS targets, eight playlist segments and two
extra disk segments. Concurrent disk reads share buffers, with at most eight
entries/32 MB per worker. Existing slow-client handling bounds response buffering.
Provider bytes remain subject to existing quotas/upstream accounting. Trusted
decoder loopback bytes are separately tracked as `internalBridgeBytes`, excluded
from LAN downstream totals and viewer counts. Converted output counts as LAN
downstream traffic. Viewer errors do not expose worker stderr, local paths or
provider credentials.

The viewer waits for a rendered frame where requestVideoFrameCallback exists.
Audio-only playback triggers compatibility recovery. Startup permits 45 seconds.
Errors use exponential reconnect delays capped at 30 seconds and six consecutive
attempts; successful picture playback resets the budget. Channel/quality changes
cancel old callbacks and timers. Hidden tabs do not cause frame-stall reconnects.

Validation:

```sh
npm --prefix electron-broadcaster run test
npm --prefix electron-broadcaster run test:iptv:player
npm --prefix electron-broadcaster/webui run build
```

Player regression tests require web UI dependencies. Lifecycle tests use owned
synthetic fixtures and fake workers; they never contact IPTV providers. Keep real
playlists and credentials out of tests/source control.

Windows packaging already unpacks `@ffmpeg-installer` outside app.asar; workers
resolve that executable. No separate FFmpeg installation is required. Source
changes do not replace an installed binary: install a rebuilt Windows package.

Shared ingest reduces internet use, but 1000 viewers still need strong LAN
bandwidth. Software encoding consumes CPU; arbitrary numbers of distinct live
channels cannot be promised.
