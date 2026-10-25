const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const fs = require('node:fs');
const path = require('node:path');
const { createCompatibility } = require('../library/iptv-compatible.cjs');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  let probes = 0, workers = 0, kills = 0, failProbe = false;
  const children = [];
  const launch = (_exe, args, options) => {
    const child = new EventEmitter();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.kill = () => { if (child.exitCode !== null) return; kills++; child.exitCode = 1; setImmediate(() => child.emit('close', 1)); };
    children.push(child);
    if (args.includes('null')) {
      probes++;
      setTimeout(() => {
        if (!failProbe) child.stderr.write(`Input #0\n Video: ${/compatible|remux/.test(args[args.indexOf('-i') + 1]) ? 'h264' : 'hevc'} (Main), yuv420p\n Audio: ${args[args.indexOf('-i') + 1].includes('remux') ? 'ac3' : 'aac'} (LC)\nStream mapping:\n`);
        child.exitCode = 0;
        child.emit('close', 0);
      }, 15);
    } else {
      workers++;
      fs.writeFileSync(path.join(options.cwd, 'index.m3u8'), '#EXTM3U\n#EXTINF:2,\nsegment000000001.ts\n');
      fs.writeFileSync(path.join(options.cwd, 'segment000000001.ts'), Buffer.alloc(188));
      assert.ok(args.includes('libx264') || args.includes('copy'), 'video is encoded or remuxed explicitly');
      assert.ok(args.includes('aac'), 'audio is normalized for browser playback');
      assert.equal(args.filter((a) => a === '-i').length, 1, 'one input per worker');
    }
    return child;
  };
  const manager = createCompatibility({ spawn: launch, executable: () => 'fake', idleMs: 5000, maxSessions: 2 });
  const channel = { id: 'owned-test', url: 'http://example.invalid/live.m3u8' };
  try {
    const sessions = await Promise.all(Array.from({ length: 20 }, () => manager.prepare(channel, 'unsupported', false)));
    assert.equal(probes, 1, 'concurrent viewers share the pending codec inspection');
    assert.equal(workers, 1, 'concurrent viewers share one conversion');
    assert.ok(sessions.every((s) => s === sessions[0]));
    const old = sessions[0];
    const changed = await manager.prepare({ ...channel, url: 'http://example.invalid/changed.m3u8' }, 'unsupported', false);
    assert.notEqual(old.id, changed.id, 'source edits invalidate segment generations');
    assert.ok(old.disposed && kills > 0, 'the old source is stopped');
    const direct = await manager.prepare({ id: 'direct', url: 'http://example.invalid/direct.m3u8' }, 'compatible', false);
    assert.equal(direct, null, 'H.264/AAC HLS keeps the direct path');
    await manager.prepare({ id: 'second', url: channel.url }, 'unsupported', true);
    await assert.rejects(manager.prepare({ id: 'capacity', url: channel.url }, 'unsupported', true), /capacity/);
    await sleep(5200);
    assert.equal(manager.status().length, 0, 'workers stop without viewer demand');
    const remuxChannel = { id: 'remux', url: channel.url };
    const remux = await manager.prepare(remuxChannel, 'remux', false);
    assert.equal(remux.transcoded, false, 'compatible video with unsupported audio is remuxed');
    const upgraded = await manager.prepare(remuxChannel, 'remux', true);
    assert.ok(upgraded.transcoded && remux.disposed, 'browser fallback upgrades a remux worker to video encoding');
    await sleep(5200);
    failProbe = true;
    const failed = { id: 'empty', url: channel.url };
    await assert.rejects(manager.prepare(failed, 'unsupported', false), /no_video/);
    failProbe = false;
    const retried = await manager.prepare(failed, 'unsupported', false);
    assert.ok(retried, 'an empty/failed probe is retried instead of cached');
    assert.ok(manager.fingerprint(channel) !== manager.fingerprint({ ...channel, headers: { Referer: 'changed' } }), 'header changes invalidate the source');
  } finally { manager.close(); }
  await sleep(100);
  assert.ok(children.every((c) => c.exitCode !== null), 'shutdown closes all decoders');
  console.log('WIVA IPTV compatibility lifecycle tests passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

