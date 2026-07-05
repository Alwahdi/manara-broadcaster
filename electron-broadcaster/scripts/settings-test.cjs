const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
const persisted = fs.readFileSync(cachePath, 'utf8');
assert.doesNotMatch(persisted, /secret-token/, 'cloud IPTV cache must not store raw source URLs');
assert.doesNotMatch(persisted, /Bearer hidden/, 'cloud IPTV cache must not store raw source headers');
assert.match(persisted, /urlCipher/, 'cloud IPTV cache stores encrypted URL payloads');

console.log('WIVA settings tests passed');
