// Manara platform subscription/activation client.
// Talks only to the owner-controlled Neon database and stores a small local cache.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { getHardwareId } = require('../licensing/machine-id.cjs');

let runtimeConfig = {};
try { runtimeConfig = require('./cloud-runtime.cjs'); } catch {}

let neonDatabaseUrl = process.env.MANARA_NEON_DATABASE_URL || runtimeConfig.neonDatabaseUrl || '';
let cachePath = null;
let cache = null;
let lastStatus = null;

const DEFAULT_FEATURES = {
  channels: false,
  iptv: false,
  media: false,
  webAdmin: false,
  analytics: false,
  branding: false,
};

function nowIso() {
  return new Date().toISOString();
}

function machineFingerprint() {
  const raw = [
    getHardwareId(),
    os.hostname(),
    os.platform(),
    os.arch(),
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function readJson(file) {
  try {
    if (!file || !fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function setCachePath(file) {
  cachePath = file;
  cache = readJson(file) || null;
}

function setNeonDatabaseUrl(url) {
  neonDatabaseUrl = String(url || '').trim() || process.env.MANARA_NEON_DATABASE_URL || runtimeConfig.neonDatabaseUrl || '';
}

async function sqlClient() {
  if (!neonDatabaseUrl) throw new Error('Owner Neon database is not configured in this build');
  const { neon } = await import('@neondatabase/serverless');
  return neon(neonDatabaseUrl);
}

function normalizeFeatures(value) {
  const incoming = value && typeof value === 'object' ? value : {};
  return {
    ...DEFAULT_FEATURES,
    ...incoming,
  };
}

function normalizeInstance(row) {
  if (!row) return null;
  const features = normalizeFeatures(row.features);
  const expiresAt = row.subscription_expires_at ? new Date(row.subscription_expires_at).toISOString() : null;
  const expired = expiresAt ? new Date(expiresAt).getTime() < Date.now() : false;
  const state = row.status === 'active' && !expired ? 'active'
    : row.status === 'active' && expired ? 'expired'
    : row.status || 'pending';
  return {
    id: row.id,
    state,
    status: row.status || 'pending',
    tenantName: row.tenant_name || '',
    contactEmail: row.contact_email || '',
    contactPhone: row.contact_phone || '',
    plan: row.plan || 'pending',
    features,
    subscriptionExpiresAt: expiresAt,
    maxDevices: Number(row.max_devices) || 1,
    activatedAt: row.activated_at ? new Date(row.activated_at).toISOString() : null,
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
    supportNote: row.support_note || '',
  };
}

function normalizePolicy(row) {
  if (!row) return null;
  return {
    channel: row.channel || 'stable',
    latestVersion: row.latest_version || '',
    minimumVersion: row.minimum_version || '',
    mandatory: !!row.mandatory,
    notes: row.notes || '',
    rolloutPercent: Number(row.rollout_percent) || 100,
  };
}

function cachedStatus(fallbackState = 'offline') {
  const instance = normalizeInstance(cache?.instance);
  const policy = normalizePolicy(cache?.updatePolicy);
  return {
    state: instance?.state || fallbackState,
    online: false,
    instance,
    updatePolicy: policy,
    features: instance?.features || { ...DEFAULT_FEATURES },
    activationId: instance?.id || cache?.activationId || '',
    fingerprint: machineFingerprint(),
    checkedAt: cache?.checkedAt || null,
    error: cache?.error || '',
  };
}

async function requestActivation(input = {}, appInfo = {}) {
  const sql = await sqlClient();
  const fingerprint = machineFingerprint();
  const tenantName = String(input.tenantName || input.organizationName || '').trim();
  const contactEmail = String(input.contactEmail || input.email || '').trim().toLowerCase();
  const contactPhone = String(input.contactPhone || input.phone || '').trim();
  if (!tenantName) throw new Error('Business/network name is required');
  if (!contactEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
    throw new Error('A valid email is required');
  }
  const rows = await sql`
    insert into platform_app_instances (
      machine_fingerprint, hardware_id, tenant_name, contact_email, contact_phone,
      hostname, app_version, install_channel, status, features, last_seen_at
    ) values (
      ${fingerprint}, ${getHardwareId()}, ${tenantName}, ${contactEmail}, ${contactPhone},
      ${os.hostname()}, ${appInfo.appVersion || ''}, ${appInfo.channel || 'stable'}, 'pending',
      ${JSON.stringify(DEFAULT_FEATURES)}::jsonb, now()
    )
    on conflict (machine_fingerprint) do update set
      tenant_name = excluded.tenant_name,
      contact_email = excluded.contact_email,
      contact_phone = excluded.contact_phone,
      hostname = excluded.hostname,
      app_version = excluded.app_version,
      install_channel = excluded.install_channel,
      last_seen_at = now()
    returning *
  `;
  const instance = normalizeInstance(rows[0]);
  cache = { ...(cache || {}), instance: rows[0], activationId: rows[0]?.id, checkedAt: nowIso(), error: '' };
  writeJson(cachePath, cache);
  lastStatus = { state: instance.state, online: true, instance, updatePolicy: normalizePolicy(cache.updatePolicy), features: instance.features, activationId: instance.id, fingerprint, checkedAt: cache.checkedAt, error: '' };
  return lastStatus;
}

async function refresh(appInfo = {}) {
  const fingerprint = machineFingerprint();
  try {
    const sql = await sqlClient();
    const rows = await sql`
      update platform_app_instances
      set last_seen_at = now(), app_version = ${appInfo.appVersion || ''}, hostname = ${os.hostname()}
      where machine_fingerprint = ${fingerprint}
      returning *
    `;
    let instanceRow = rows[0];
    if (!instanceRow && cache?.activationId) {
      const fallback = await sql`
        select * from platform_app_instances
        where id = ${cache.activationId}
        limit 1
      `;
      instanceRow = fallback[0] || null;
    }
    const policyRows = await sql`
      select channel, latest_version, minimum_version, mandatory, notes, rollout_percent
      from platform_update_policies
      where channel = ${appInfo.channel || 'stable'} and is_active = true
      order by created_at desc
      limit 1
    `;
    const instance = normalizeInstance(instanceRow);
    const updatePolicy = normalizePolicy(policyRows[0]);
    cache = { ...(cache || {}), instance: instanceRow || cache?.instance || null, updatePolicy: policyRows[0] || null, activationId: instance?.id || cache?.activationId || '', checkedAt: nowIso(), error: '' };
    writeJson(cachePath, cache);
    lastStatus = {
      state: instance?.state || 'unregistered',
      online: true,
      instance,
      updatePolicy,
      features: instance?.features || { ...DEFAULT_FEATURES },
      activationId: instance?.id || '',
      fingerprint,
      checkedAt: cache.checkedAt,
      error: '',
    };
    return lastStatus;
  } catch (e) {
    cache = { ...(cache || {}), checkedAt: nowIso(), error: e.message };
    writeJson(cachePath, cache);
    lastStatus = { ...cachedStatus('offline'), error: e.message, checkedAt: cache.checkedAt };
    return lastStatus;
  }
}

function status() {
  return lastStatus || cachedStatus(cache?.instance ? 'cached' : 'unregistered');
}

function hasFeature(name) {
  const s = status();
  return s.state === 'active' && !!s.features?.[name];
}

module.exports = {
  DEFAULT_FEATURES,
  setCachePath,
  setNeonDatabaseUrl,
  requestActivation,
  refresh,
  status,
  hasFeature,
};
