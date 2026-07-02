const assert = require('node:assert/strict');

const {
  issueEntitlement,
  decodeEntitlement,
  verifyEntitlement,
  hasFeature,
} = require('../licensing/entitlements.cjs');

const secret = 'test-secret-with-at-least-32-characters-long';
const now = Date.UTC(2026, 6, 2, 8, 0, 0);

const payload = {
  tenantId: 'tenant_123',
  installationId: 'install_abc',
  hardwareId: 'hw_xyz',
  plan: 'pro',
  features: ['iptv', 'library', 'analytics', 'iptv'],
  issuedAt: now,
  notBefore: now - 1000,
  expiresAt: now + 86400000,
  offlineGraceUntil: now + 7 * 86400000,
  channel: 'stable',
};

const token = issueEntitlement(payload, secret, { now, keyId: 'test-key' });
assert.equal(token.split('.').length, 3);

const valid = verifyEntitlement(token, secret, {
  now,
  tenantId: 'tenant_123',
  installationId: 'install_abc',
  hardwareId: 'hw_xyz',
});
assert.equal(valid.ok, true);
assert.equal(valid.entitlement.plan, 'pro');
assert.deepEqual(valid.entitlement.features, ['analytics', 'iptv', 'library']);
assert.equal(hasFeature(valid.entitlement, 'iptv'), true);
assert.equal(hasFeature(valid.entitlement, 'billing'), false);

const wrongSecret = verifyEntitlement(token, 'another-secret-with-at-least-32-characters', { now });
assert.equal(wrongSecret.ok, false);
assert.equal(wrongSecret.reason, 'invalid_signature');

const wrongTenant = verifyEntitlement(token, secret, { now, tenantId: 'tenant_other' });
assert.equal(wrongTenant.ok, false);
assert.equal(wrongTenant.reason, 'tenant_mismatch');

const wrongHardware = verifyEntitlement(token, secret, { now, hardwareId: 'other_hw' });
assert.equal(wrongHardware.ok, false);
assert.equal(wrongHardware.reason, 'hardware_mismatch');

const expired = verifyEntitlement(token, secret, { now: now + 2 * 86400000, clockSkewMs: 0 });
assert.equal(expired.ok, false);
assert.equal(expired.reason, 'expired');

const decoded = decodeEntitlement(token);
const tamperedBody = Buffer.from(JSON.stringify({ ...decoded.body, plan: 'enterprise' })).toString('base64url');
const tampered = token.split('.')[0] + '.' + tamperedBody + '.' + token.split('.')[2];
const tamperedResult = verifyEntitlement(tampered, secret, { now });
assert.equal(tamperedResult.ok, false);
assert.equal(tamperedResult.reason, 'invalid_signature');

assert.throws(() => issueEntitlement(payload, 'short', { now }), /at least 32/);

console.log('WIVA entitlement tests passed');
