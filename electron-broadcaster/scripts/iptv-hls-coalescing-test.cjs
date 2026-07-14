const assert = require('node:assert/strict');
const http = require('node:http');

const iptv = require('../library/iptv.cjs');
const VIEWERS = Math.max(1, Number(process.env.WIVA_HLS_VIEWERS || 20));
const MAX_RSS_GROWTH_MB = Math.max(32, Number(process.env.WIVA_HLS_MAX_RSS_GROWTH_MB || 384));

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function main() {
  let playlistHits = 0;
  let segmentHits = 0;
  let firstSegmentChunkAt = 0;
  let upstreamBroken = false;
  const segmentBody = Buffer.alloc(256 * 1024, 7);

  const upstream = http.createServer((req, res) => {
    if (upstreamBroken) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('temporarily unavailable');
      return;
    }
    if (req.url === '/live/index.m3u8') {
      playlistHits += 1;
      const base = `http://${req.headers.host}`;
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      res.end([
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:4',
        '#EXT-X-MEDIA-SEQUENCE:1',
        '#EXTINF:4.000,',
        `${base}/live/seg-1.ts`,
        '',
      ].join('\n'));
      return;
    }
    if (req.url === '/live/seg-1.ts') {
      segmentHits += 1;
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'video/mp2t', 'Content-Length': segmentBody.length });
        firstSegmentChunkAt = Date.now();
        res.write(segmentBody.subarray(0, segmentBody.length / 2));
        setTimeout(() => res.end(segmentBody.subarray(segmentBody.length / 2)), 850);
      }, 150);
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  await listen(upstream);
  const upstreamBase = `http://127.0.0.1:${upstream.address().port}`;
  const channel = {
    id: 'hls-coalesce-test',
    name: 'HLS Coalescing Test',
    url: `${upstreamBase}/live/index.m3u8`,
    enabled: true,
    headers: {},
  };

  const proxy = http.createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://127.0.0.1');
    if (u.pathname === '/iptv/test/index.m3u8') {
      return iptv.handleRequest(channel, '', Object.fromEntries(u.searchParams), req, res, `http://${req.headers.host}/iptv/test`, {});
    }
    if (u.pathname === '/iptv/test/seg') {
      return iptv.handleRequest(channel, 'seg', Object.fromEntries(u.searchParams), req, res, `http://${req.headers.host}/iptv/test`, {});
    }
    res.writeHead(404);
    res.end('not found');
  });
  await listen(proxy);
  const proxyBase = `http://127.0.0.1:${proxy.address().port}`;

  try {
    const playlistRes = await fetch(`${proxyBase}/iptv/test/index.m3u8`);
    assert.equal(playlistRes.status, 200);
    const playlist = await playlistRes.text();
    assert.equal(playlistHits, 1, 'playlist should be fetched once from upstream');
    assert.match(playlist, /\/iptv\/test\/seg\?t=/, 'playlist should use opaque local segment tokens');
    assert.doesNotMatch(playlist, /\/live\/seg-1\.ts/, 'playlist must not expose the upstream segment path');
    assert.doesNotMatch(playlist, new RegExp(String(upstream.address().port)), 'playlist must not expose the upstream provider host or port');
    const segmentPath = playlist.split(/\r?\n/).find((line) => line.includes('/iptv/test/seg?t='));
    assert.ok(segmentPath, 'rewritten segment URL exists');

    const segmentUrl = new URL(segmentPath, proxyBase).toString();
    const rssBefore = process.memoryUsage().rss;
    const startedAt = Date.now();
    let firstProxyChunkAt = 0;
    const responses = await Promise.all(Array.from({ length: VIEWERS }, () => fetch(segmentUrl)));
    assert.deepEqual(responses.map((res) => res.status), Array(VIEWERS).fill(200));
    const bodyLengths = await Promise.all(responses.map(async (res, index) => {
      if (index !== 0) {
        let total = 0;
        for await (const chunk of res.body) total += chunk.byteLength;
        return total;
      }
      const reader = res.body.getReader();
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!firstProxyChunkAt) firstProxyChunkAt = Date.now();
        total += value.byteLength;
      }
      return total;
    }));
    const elapsedMs = Date.now() - startedAt;
    const rssGrowthMb = Math.max(0, process.memoryUsage().rss - rssBefore) / (1024 * 1024);
    assert.ok(bodyLengths.every((length) => length === segmentBody.length), 'all viewers receive the full segment');
    assert.equal(segmentHits, 1, 'concurrent viewers for one HLS segment must coalesce to one upstream request');
    assert.ok(firstProxyChunkAt > 0, 'proxy sends the first segment bytes to viewers');
    assert.ok(firstProxyChunkAt - firstSegmentChunkAt < 350, 'proxy must stream the first bytes instead of waiting for the complete upstream segment');
    assert.ok(rssGrowthMb <= MAX_RSS_GROWTH_MB, `RSS growth ${rssGrowthMb.toFixed(1)}MB exceeded ${MAX_RSS_GROWTH_MB}MB`);

    const cached = await fetch(segmentUrl);
    assert.equal(cached.status, 200);
    await cached.arrayBuffer();
    assert.equal(segmentHits, 1, 'cached HLS segment must not refetch upstream');

    await new Promise((resolve) => setTimeout(resolve, 2200));
    upstreamBroken = true;
    const stalePlaylistRes = await fetch(`${proxyBase}/iptv/test/index.m3u8`);
    assert.equal(stalePlaylistRes.status, 200, 'playlist should fall back to the last good response during a brief upstream outage');
    const stalePlaylist = await stalePlaylistRes.text();
    assert.match(stalePlaylist, /\/iptv\/test\/seg\?t=/, 'stale playlist should still use opaque local segment tokens');
    upstreamBroken = false;

    const status = iptv.status()[channel.id];
    assert.ok(
      status.cacheCoalesced + status.cacheHits >= VIEWERS - 1,
      'every additional viewer reuses either the in-flight or cached segment',
    );
    assert.ok(status.cacheHits >= 1, 'metrics record a cache hit after the first segment load');
    assert.ok(status.hlsTokenEntries >= 1, 'metrics expose active HLS token entries');
    console.log(JSON.stringify({
      viewers: VIEWERS,
      upstreamSegmentRequests: segmentHits,
      downstreamBytes: VIEWERS * segmentBody.length,
      elapsedMs,
      rssGrowthMb: Number(rssGrowthMb.toFixed(1)),
      cacheCoalesced: status.cacheCoalesced,
      cacheHits: status.cacheHits,
    }, null, 2));
    console.log('WIVA IPTV HLS coalescing test passed');
  } finally {
    await close(proxy);
    await close(upstream);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
