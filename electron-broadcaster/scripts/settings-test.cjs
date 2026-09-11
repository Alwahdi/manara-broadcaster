const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeJsonAtomic } = require('../library/atomic-write.cjs');

const { normalizePortSetting } = require('../library/settings-utils.cjs');
const cloudIptv = require('../library/cloud-iptv.cjs');

assert.equal(normalizePortSetting(8080, 8787), 8080, 'live port 8080 must persist after restart');
assert.equal(normalizePortSetting('8080', 8787), 8080, 'string live port 8080 must persist after restart');
assert.equal(normalizePortSetting(8420, 8788), 8420, 'library/admin port 8420 must persist after restart');
assert.equal(normalizePortSetting('8420', 8788), 8420, 'string library/admin port 8420 must persist after restart');
assert.equal(normalizePortSetting(8787, 8080), 8787);
assert.equal(normalizePortSetting(8788, 8420), 8788);
assert.equal(normalizePortSetting('', 8787), 8787);
assert.equal(normalizePortSetting(0, 8787), 8787);
assert.equal(normalizePortSetting(65536, 8787), 8787);
assert.equal(normalizePortSetting('not-a-port', 8787), 8787);

const atomicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiva-atomic-'));
try {
  const destination = path.join(atomicDir, 'state.json');
  const original = '{"preserved":true}';
  fs.writeFileSync(destination, original);
  const rename = fs.renameSync;
  const write = fs.writeFileSync;
  let attempts = 0;
  try {
    fs.renameSync = () => {
      attempts += 1;
      throw Object.assign(new Error('Destination locked'), { code: 'EPERM' });
    };
    fs.writeFileSync = (target, ...args) => {
      if (target === destination) throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' });
      return write(target, ...args);
    };
    assert.throws(() => writeJsonAtomic(destination, { replacement: true }));
    assert.equal(fs.readFileSync(destination, 'utf8'), original, 'failed replacement must preserve the last durable state');
    assert.equal(attempts, 6, 'transient locks are retried a bounded number of times');
    assert.deepEqual(fs.readdirSync(atomicDir), ['state.json'], 'failed writes clean their staging file');
  } finally {
    fs.renameSync = rename;
    fs.writeFileSync = write;
  }
  writeJsonAtomic(destination, { replacement: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(destination, 'utf8')), { replacement: true });
  try {
    attempts = 0;
    fs.renameSync = (...args) => {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error('Temporary lock'), { code: 'EBUSY' });
      assert.deepEqual(JSON.parse(fs.readFileSync(destination, 'utf8')), { replacement: true });
      return rename(...args);
    };
    writeJsonAtomic(destination, { recovered: true });
    assert.equal(attempts, 3);
    assert.deepEqual(JSON.parse(fs.readFileSync(destination, 'utf8')), { recovered: true });
    fs.renameSync = () => {
      throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' });
    };
    assert.throws(() => writeJsonAtomic(destination, { lost: true }), { code: 'ENOSPC' });
    assert.deepEqual(JSON.parse(fs.readFileSync(destination, 'utf8')), { recovered: true });
    assert.deepEqual(fs.readdirSync(atomicDir), ['state.json']);
  } finally {
    fs.renameSync = rename;
  }
} finally {
  fs.rmSync(atomicDir, { recursive: true, force: true });
}

const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiva-cloud-cache-'));
const cachePath = path.join(cacheDir, 'cloud-iptv-cache.json');
const secretUrl = 'https://provider.example/live/secret-token/index.m3u8';
fs.writeFileSync(cachePath, JSON.stringify({
  channels: [{
    id: 'secret',
    name: 'Secret IPTV',
    url: secretUrl,
    headers: { Authorization: 'Bearer hidden' },
  }],
  lastFetch: Date.now(),
}));
cloudIptv.setCachePath(cachePath);
assert.equal(cloudIptv.getById('secret').url, secretUrl, 'proxy internals can still decrypt cached IPTV URLs');
assert.equal(cloudIptv.list()[0].url, undefined, 'public cloud IPTV list must not expose source URLs');
assert.equal(cloudIptv.list({ includeUrl: true })[0].url, secretUrl, 'server internals can request cloud IPTV URLs for safe playable payload construction');
const persisted = fs.readFileSync(cachePath, 'utf8');
assert.doesNotMatch(persisted, /secret-token/, 'cloud IPTV cache must not store raw source URLs');
assert.doesNotMatch(persisted, /Bearer hidden/, 'cloud IPTV cache must not store raw source headers');
assert.match(persisted, /urlCipher/, 'cloud IPTV cache stores encrypted URL payloads');

console.log('WIVA settings tests passed');
