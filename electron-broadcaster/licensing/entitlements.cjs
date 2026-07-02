const crypto = require('node:crypto');

const TOKEN_VERSION = 1;
const DEFAULT_CLOCK_SKEW_MS = 5 * 60 * 1000;

function base64urlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64urlJson(value) {
  return base64urlEncode(JSON.stringify(value));
}

function base64urlDecode(value) {
  return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
}

function normalizeFeatures(features) {
  if (Array.isArray(features)) return [...new Set(features.map(String).filter(Boolean))].sort();
  if (features && typeof features === 'object') {
    return Object.keys(features).filter((key) => !!features[key]).sort();
  }
  return [];
}

function normalizeEntitlement(payload = {}, now = Date.now()) {
  const issuedAt = Number(payload.issuedAt || payload.iat || now);
  const expiresAt = Number(payload.expiresAt || payload.exp || 0);
  const notBefore = Number(payload.notBefore || payload.nbf || issuedAt - DEFAULT_CLOCK_SKEW_MS);

  return {
    v: TOKEN_VERSION,
    tenantId: String(payload.tenantId || ''),
    installationId: String(payload.installationId || ''),
    hardwareId: String(payload.hardwareId || ''),
    plan: String(payload.plan || 'trial'),
    features: normalizeFeatures(payload.features),
    issuedAt,
    notBefore,
    expiresAt,
    offlineGraceUntil: Number(payload.offlineGraceUntil || 0),
    channel: String(payload.channel || 'stable'),
    subject: String(payload.subject || payload.installationId || ''),
  };
}

function assertValidSigningKey(secret) {
  if (!secret || String(secret).length < 32) {
    throw new Error('entitlement signing secret must be at least 32 characters');
  }
}

function signPayload(payload, secret) {
  assertValidSigningKey(secret);
  return crypto.createHmac('sha256', String(secret)).update(stableJson(payload)).digest('base64url');
}

function timingSafeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function issueEntitlement(payload, secret, options = {}) {
  const header = { alg: 'HS256', typ: 'WIVA-ENT', kid: String(options.keyId || 'default'), v: TOKEN_VERSION };
  const body = normalizeEntitlement(payload, Number(options.now || Date.now()));
  const signingInput = base64urlJson(header) + '.' + base64urlJson(body);
  const signature = crypto.createHmac('sha256', String(secret)).update(signingInput).digest('base64url');
  assertValidSigningKey(secret);
  return signingInput + '.' + signature;
}

function decodeEntitlement(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('invalid entitlement token format');
  const [encodedHeader, encodedBody, signature] = parts;
  let header;
  let body;
  try {
    header = JSON.parse(base64urlDecode(encodedHeader));
    body = JSON.parse(base64urlDecode(encodedBody));
  } catch {
    throw new Error('invalid entitlement token encoding');
  }
  return { header, body, signature, signingInput: encodedHeader + '.' + encodedBody };
}

function verifyEntitlement(token, secret, options = {}) {
  assertValidSigningKey(secret);
  const now = Number(options.now || Date.now());
  const clockSkewMs = Number(options.clockSkewMs ?? DEFAULT_CLOCK_SKEW_MS);
  const decoded = decodeEntitlement(token);

  if (decoded.header.alg !== 'HS256' || decoded.header.typ !== 'WIVA-ENT') {
    return { ok: false, reason: 'unsupported_entitlement_header' };
  }

  const expectedSignature = crypto.createHmac('sha256', String(secret)).update(decoded.signingInput).digest('base64url');
  if (!timingSafeEqual(decoded.signature, expectedSignature)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  const entitlement = normalizeEntitlement(decoded.body, now);

  if (options.tenantId && entitlement.tenantId !== String(options.tenantId)) return { ok: false, reason: 'tenant_mismatch', entitlement };
  if (options.installationId && entitlement.installationId !== String(options.installationId)) return { ok: false, reason: 'installation_mismatch', entitlement };
  if (options.hardwareId && entitlement.hardwareId !== String(options.hardwareId)) return { ok: false, reason: 'hardware_mismatch', entitlement };

  if (entitlement.notBefore && now + clockSkewMs < entitlement.notBefore) return { ok: false, reason: 'not_yet_valid', entitlement };
  if (entitlement.expiresAt && now - clockSkewMs > entitlement.expiresAt) return { ok: false, reason: 'expired', entitlement };

  return { ok: true, entitlement };
}

function hasFeature(entitlement, feature) {
  return normalizeFeatures(entitlement?.features).includes(String(feature));
}

module.exports = {
  TOKEN_VERSION,
  normalizeEntitlement,
  issueEntitlement,
  decodeEntitlement,
  verifyEntitlement,
  hasFeature,
  _internal: { stableJson, normalizeFeatures, signPayload },
};
