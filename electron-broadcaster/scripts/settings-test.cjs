const assert = require('node:assert/strict');

const { normalizePortSetting } = require('../library/settings-utils.cjs');

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

console.log('WIVA settings tests passed');
