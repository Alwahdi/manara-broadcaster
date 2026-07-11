const assert = require('node:assert/strict');
const { WebSocket } = require('ws');

const { startSignalingServer } = require('../server/signaling.cjs');

const VIEWERS = Math.max(1, Number(process.env.WIVA_CAPTURE_VIEWERS || 500));
const RAMP_MS = Math.max(0, Number(process.env.WIVA_CAPTURE_RAMP_MS || 5000));

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(check, timeoutMs = 5000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for signaling state');
    await delay(10);
  }
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function waitForMessage(ws, type, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), timeoutMs);
    const onMessage = (raw) => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message.type !== type) return;
      clearTimeout(timer);
      ws.off('message', onMessage);
      resolve(message);
    };
    ws.on('message', onMessage);
  });
}

async function main() {
  let idleCalls = 0;
  const channel = { id: 'capture-scale', name: 'Capture Scale', enabled: true };
  const signaling = startSignalingServer({
    port: 0,
    getBroadcastChannels: () => [channel],
    getFeatureAllowed: () => true,
    onBroadcastIdle: () => { idleCalls += 1; },
  });
  while (!signaling.address()) await delay(10);
  const url = `ws://127.0.0.1:${signaling.address().port}/ws`;
  const sockets = [];
  const broadcasterMessages = [];
  let broadcaster;
  const rssBefore = process.memoryUsage().rss;
  const startedAt = Date.now();

  try {
    broadcaster = await openSocket(url);
    const ready = waitForMessage(broadcaster, 'broadcaster-ready');
    broadcaster.send(JSON.stringify({ type: 'register-broadcaster', channelId: channel.id, name: channel.name }));
    await ready;
    broadcaster.on('message', (raw) => {
      try { broadcasterMessages.push(JSON.parse(raw.toString())); } catch {}
    });

    await Promise.all(Array.from({ length: VIEWERS }, async (_, index) => {
      if (RAMP_MS) await delay(Math.floor(index * RAMP_MS / VIEWERS));
      const viewer = await openSocket(url);
      sockets.push(viewer);
      const registered = waitForMessage(viewer, 'viewer-id');
      viewer.send(JSON.stringify({ type: 'register-viewer', channelId: channel.id, quality: index % 3 === 0 ? '480' : index % 3 === 1 ? '720' : '1080' }));
      await registered;
    }));

    const elapsedMs = Date.now() - startedAt;
    const stats = signaling.getStats().channels.find((row) => row.id === channel.id);
    assert.equal(stats?.viewers, VIEWERS, 'all simulated capture viewers must remain registered');
    assert.equal(stats?.live, true, 'capture broadcaster must remain online under signaling load');
    await waitUntil(() => broadcasterMessages.filter((message) => message.type === 'viewer-joined').length === VIEWERS);
    assert.equal(broadcasterMessages.filter((message) => message.type === 'viewer-joined').length, VIEWERS, 'broadcaster receives every viewer join');
    assert.ok(broadcasterMessages.some((message) => message.type === 'viewer-joined' && message.quality === '480'), 'capture quality preference reaches the broadcaster');

    const qualityChanged = waitForMessage(broadcaster, 'set-quality');
    sockets[0].send(JSON.stringify({ type: 'set-quality', quality: '720' }));
    const qualityMessage = await qualityChanged;
    assert.equal(qualityMessage.quality, '720', 'viewer can change HDMI quality without reconnecting');

    const rssGrowthMb = Math.max(0, process.memoryUsage().rss - rssBefore) / (1024 * 1024);
    console.log(JSON.stringify({
      viewers: VIEWERS,
      rampMs: RAMP_MS,
      registeredViewers: stats.viewers,
      elapsedMs,
      rssGrowthMb: Number(rssGrowthMb.toFixed(1)),
    }, null, 2));

    for (const viewer of sockets) viewer.close();
    await delay(250);
    assert.ok(idleCalls >= 1, 'last capture viewer leaving must trigger idle cleanup');
  } finally {
    for (const viewer of sockets) {
      try { viewer.terminate(); } catch {}
    }
    try { broadcaster?.terminate(); } catch {}
    await signaling.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
