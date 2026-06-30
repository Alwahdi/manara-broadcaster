// License verification + offline cache.
// Calls the WIVA cloud endpoint and caches the result locally so the app
// keeps working offline for up to `validForDays` days from last successful check.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { getHardwareId } = require('./machine-id.cjs');

const CLOUD_BASE = process.env.MANARA_CLOUD_URL ||
  'https://project--67c27b7a-ed28-4f60-b80e-05a2f89dcda5.lovable.app';
const VERIFY_URL = CLOUD_BASE + '/api/public/license/verify';
const TRIAL_DAYS = 7;
// Local cache integrity HMAC key (not a secret — just tamper detection).
const SIG_KEY = 'manara-local-cache-v1';

function sign(obj) {
  const json = JSON.stringify(obj);
  const sig = crypto.createHmac('sha256', SIG_KEY).update(json).digest('hex');
  return { json, sig };
}

function verifySig(json, sig) {
  const expected = crypto.createHmac('sha256', SIG_KEY).update(json).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch { return false; }
}

function readCache(cachePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (!raw.json || !raw.sig || !verifySig(raw.json, raw.sig)) return null;
    return JSON.parse(raw.json);
  } catch { return null; }
}

function writeCache(cachePath, payload) {
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(sign(payload)));
  } catch { }
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const data = Buffer.from(JSON.stringify(body));
      const req = https.request({
        method: 'POST',
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length,
          'User-Agent': 'WIVA-Agent',
        },
        timeout: 10000,
      }, (res) => {
        let chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            resolve({ status: res.statusCode || 0, body: parsed });
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.write(data);
      req.end();
    } catch (e) { reject(e); }
  });
}

// Returns { state: 'licensed'|'trial'|'expired'|'invalid'|'mismatch'|'offline_grace',
//           license?, hardwareId, trialEndsAt? }
async function verifyLicense({ key, cachePath, firstRunPath, appVersion }) {
  const hardwareId = getHardwareId();

  // Trial bookkeeping
  let trialStart;
  try { trialStart = JSON.parse(fs.readFileSync(firstRunPath, 'utf8')).startedAt; }
  catch {
    trialStart = new Date().toISOString();
    try {
      fs.mkdirSync(path.dirname(firstRunPath), { recursive: true });
      fs.writeFileSync(firstRunPath, JSON.stringify({ startedAt: trialStart }));
    } catch { }
  }
  const trialEndsAt = new Date(new Date(trialStart).getTime() + TRIAL_DAYS * 86400000);

  if (!key) {
    return { state: trialEndsAt > new Date() ? 'trial' : 'expired', hardwareId, trialEndsAt };
  }

  // Try online verification
  try {
    const res = await postJson(VERIFY_URL, { key, hardwareId, appVersion });
    if (res.status === 200 && res.body?.ok) {
      const license = { ...res.body, key, hardwareId, verifiedAt: new Date().toISOString() };
      writeCache(cachePath, license);
      return { state: 'licensed', license, hardwareId };
    }
    if (res.status === 409) return { state: 'mismatch', hardwareId };
    if (res.status === 403 || res.status === 404) {
      return { state: 'invalid', hardwareId, reason: res.body?.error };
    }
  } catch {
    // Fall through to offline cache
  }

  // Offline grace
  const cached = readCache(cachePath);
  if (cached && cached.key === key && cached.hardwareId === hardwareId) {
    const verifiedAt = new Date(cached.verifiedAt);
    const validForDays = cached.validForDays || 30;
    const stillValid = (Date.now() - verifiedAt.getTime()) < validForDays * 86400000;
    if (stillValid) return { state: 'offline_grace', license: cached, hardwareId };
  }

  return { state: trialEndsAt > new Date() ? 'trial' : 'expired', hardwareId, trialEndsAt };
}

module.exports = { verifyLicense, getHardwareId, TRIAL_DAYS };
