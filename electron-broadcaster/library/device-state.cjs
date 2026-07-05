// WIVA — licensed device cloud backup/sync for Windows state.
// The app remains fully local-first; this only prevents data loss across
// restarts/reinstalls by backing up settings + local channels by license/device.
const https = require('https');
let runtimeConfig = {};
try { runtimeConfig = require('./cloud-runtime.cjs'); } catch {}

const CLOUD_BASE = String(process.env.WIVA_CLOUD_URL || process.env.MANARA_CLOUD_URL || runtimeConfig.cloudUrl || '').trim().replace(/\/+$/g, '');
const DEVICE_STATE_URL = CLOUD_BASE ? CLOUD_BASE + '/api/public/device-state' : '';

function postJson(body) {
  return new Promise((resolve, reject) => {
    const u = new URL(DEVICE_STATE_URL);
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
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          resolve({ status: res.statusCode || 0, body: parsed });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.write(data);
    req.end();
  });
}

async function pull({ key, hardwareId, appVersion }) {
  if (!key || !hardwareId || !DEVICE_STATE_URL) return null;
  const res = await postJson({ key, hardwareId, appVersion, mode: 'pull' });
  if (res.status >= 200 && res.status < 300 && res.body?.ok) return res.body.state || null;
  throw new Error(res.body?.error || `device-state pull HTTP ${res.status}`);
}

async function merge({ key, hardwareId, appVersion, state }) {
  if (!key || !hardwareId || !DEVICE_STATE_URL) return null;
  const res = await postJson({ key, hardwareId, appVersion, mode: 'merge', state });
  if (res.status >= 200 && res.status < 300 && res.body?.ok) return res.body.state || null;
  throw new Error(res.body?.error || `device-state merge HTTP ${res.status}`);
}

module.exports = { pull, merge };
