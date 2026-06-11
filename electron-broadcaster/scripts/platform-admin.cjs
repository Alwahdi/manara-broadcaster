#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DEFAULT_FEATURES = ['channels', 'iptv', 'media', 'webAdmin', 'analytics', 'branding'];

function usage() {
  console.log(`Manara platform admin

Usage:
  node scripts/platform-admin.cjs apply-schema
  node scripts/platform-admin.cjs list [pending|active|expired|suspended|all]
  node scripts/platform-admin.cjs approve <instance-id> [--plan=pro] [--days=365] [--features=all|channels,iptv,media,webAdmin,analytics,branding]
  node scripts/platform-admin.cjs suspend <instance-id> [reason]
  node scripts/platform-admin.cjs expire <instance-id>
  node scripts/platform-admin.cjs policy --channel=stable --latest=2.5.12 --minimum=2.5.0 [--mandatory=true] [--notes="..."]
`);
}

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find((v) => v.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function parseFeatures(value) {
  const raw = String(value || 'all').trim();
  const enabled = raw === 'all' ? DEFAULT_FEATURES : raw.split(',').map((s) => s.trim()).filter(Boolean);
  return Object.fromEntries(DEFAULT_FEATURES.map((name) => [name, enabled.includes(name)]));
}

async function sqlClient() {
  const url = process.env.MANARA_NEON_DATABASE_URL || process.env.DATABASE_URL || '';
  if (!url) throw new Error('Set MANARA_NEON_DATABASE_URL or DATABASE_URL before running this command.');
  const { neon } = await import('@neondatabase/serverless');
  return neon(url);
}

function printRows(rows) {
  if (!rows.length) {
    console.log('No rows.');
    return;
  }
  for (const r of rows) {
    console.log([
      r.id,
      r.status,
      r.plan,
      r.tenant_name,
      r.contact_email,
      r.subscription_expires_at ? new Date(r.subscription_expires_at).toISOString() : '',
      r.app_version || '',
      r.last_seen_at ? new Date(r.last_seen_at).toISOString() : '',
    ].join('\t'));
  }
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === '--help' || cmd === '-h') {
    usage();
    return;
  }
  const sql = await sqlClient();

  if (cmd === 'apply-schema') {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'neon', 'schema.sql'), 'utf8');
    await sql.query(schema);
    console.log('Schema applied.');
    return;
  }

  if (cmd === 'list') {
    const status = process.argv[3] || 'pending';
    const rows = status === 'all'
      ? await sql`select * from platform_app_instances order by created_at desc limit 200`
      : await sql`select * from platform_app_instances where status = ${status} order by created_at desc limit 200`;
    printRows(rows);
    return;
  }

  if (cmd === 'approve') {
    const id = process.argv[3];
    if (!id) throw new Error('approve requires an instance id');
    const plan = arg('plan', 'pro');
    const days = Math.max(1, Number(arg('days', '365')) || 365);
    const features = parseFeatures(arg('features', 'all'));
    const rows = await sql`
      update platform_app_instances
      set status = 'active',
          plan = ${plan},
          features = ${JSON.stringify(features)}::jsonb,
          subscription_expires_at = now() + (${days}::text || ' days')::interval,
          activated_at = coalesce(activated_at, now()),
          support_note = ${arg('note', '')}
      where id = ${id}
      returning *
    `;
    printRows(rows);
    return;
  }

  if (cmd === 'suspend') {
    const id = process.argv[3];
    if (!id) throw new Error('suspend requires an instance id');
    const reason = process.argv.slice(4).join(' ') || 'Suspended by platform owner';
    const rows = await sql`
      update platform_app_instances
      set status = 'suspended', support_note = ${reason}
      where id = ${id}
      returning *
    `;
    printRows(rows);
    return;
  }

  if (cmd === 'expire') {
    const id = process.argv[3];
    if (!id) throw new Error('expire requires an instance id');
    const rows = await sql`
      update platform_app_instances
      set status = 'expired', subscription_expires_at = now()
      where id = ${id}
      returning *
    `;
    printRows(rows);
    return;
  }

  if (cmd === 'policy') {
    const channel = arg('channel', 'stable');
    const latest = arg('latest', '');
    if (!latest) throw new Error('policy requires --latest=x.y.z');
    const minimum = arg('minimum', '0.0.0');
    const mandatory = ['1', 'true', 'yes'].includes(arg('mandatory', 'false').toLowerCase());
    const notes = arg('notes', '');
    await sql`update platform_update_policies set is_active = false where channel = ${channel}`;
    const rows = await sql`
      insert into platform_update_policies (channel, latest_version, minimum_version, mandatory, notes, is_active)
      values (${channel}, ${latest}, ${minimum}, ${mandatory}, ${notes}, true)
      returning *
    `;
    printRows(rows);
    return;
  }

  usage();
  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
