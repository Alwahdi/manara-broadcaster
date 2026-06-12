#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
require('../library/env.cjs').loadLocalEnv(path.join(__dirname, '..'));

const DEFAULT_FEATURES = ['channels', 'iptv', 'media', 'webAdmin', 'analytics', 'branding'];

function usage() {
  console.log(`Manara platform admin

Usage:
  node scripts/platform-admin.cjs apply-schema
  node scripts/platform-admin.cjs list [pending|active|expired|suspended|all]
  node scripts/platform-admin.cjs approve <instance-id> [--plan=pro] [--days=365] [--features=all|channels,iptv,media,webAdmin,analytics,branding]
  node scripts/platform-admin.cjs import-hydra-bein [--limit-bytes=0]
  node scripts/platform-admin.cjs import-hydra-bein-file [--file=scripts/hydra-bein-channels.json] [--limit-bytes=0]
  node scripts/platform-admin.cjs suspend <instance-id> [reason]
  node scripts/platform-admin.cjs expire <instance-id>
  node scripts/platform-admin.cjs policy --channel=stable --latest=2.5.13 --minimum=2.5.0 [--mandatory=true] [--notes="..."]
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

function splitSqlStatements(sqlText) {
  const statements = [];
  let current = '';
  let single = false;
  let double = false;
  let dollarTag = '';
  for (let i = 0; i < sqlText.length; i += 1) {
    const ch = sqlText[i];
    const next = sqlText[i + 1] || '';
    if (!single && !double && !dollarTag && ch === '-' && next === '-') {
      while (i < sqlText.length && sqlText[i] !== '\n') i += 1;
      current += '\n';
      continue;
    }
    if (!single && !double && !dollarTag && ch === '/' && next === '*') {
      i += 2;
      while (i < sqlText.length && !(sqlText[i] === '*' && sqlText[i + 1] === '/')) i += 1;
      i += 1;
      continue;
    }
    if (!single && !double && ch === '$') {
      const rest = sqlText.slice(i);
      const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(rest);
      if (match) {
        const tag = match[0];
        if (!dollarTag) dollarTag = tag;
        else if (dollarTag === tag) dollarTag = '';
        current += tag;
        i += tag.length - 1;
        continue;
      }
    }
    if (!double && !dollarTag && ch === "'" && single && next === "'") {
      current += "''";
      i += 1;
      continue;
    }
    if (!double && !dollarTag && ch === "'") single = !single;
    else if (!single && !dollarTag && ch === '"') double = !double;
    if (!single && !double && !dollarTag && ch === ';') {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = '';
      continue;
    }
    current += ch;
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
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

function hydraConfig() {
  const host = String(process.env.HYDRA_IPTV_HOST || '').trim().replace(/^https?:\/\//i, '');
  const username = String(process.env.HYDRA_IPTV_USERNAME || '').trim();
  const password = String(process.env.HYDRA_IPTV_PASSWORD || '').trim();
  if (!host || !username || !password) {
    throw new Error('Set HYDRA_IPTV_HOST, HYDRA_IPTV_USERNAME, and HYDRA_IPTV_PASSWORD before importing Hydra IPTV.');
  }
  return { host, username, password, base: `http://${host}` };
}

async function fetchHydraJson(action) {
  const cfg = hydraConfig();
  const url = `${cfg.base}/player_api.php?username=${encodeURIComponent(cfg.username)}&password=${encodeURIComponent(cfg.password)}&action=${encodeURIComponent(action)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20' } });
  if (!res.ok) throw new Error(`Hydra ${action} failed: HTTP ${res.status}`);
  return res.json();
}

async function hydraBeinChannelsFromProvider() {
  const cfg = hydraConfig();
  const [streams, categories] = await Promise.all([
    fetchHydraJson('get_live_streams'),
    fetchHydraJson('get_live_categories'),
  ]);
  if (!Array.isArray(streams)) throw new Error('Hydra streams response was not an array.');
  const catMap = new Map(Array.isArray(categories)
    ? categories.map((c) => [String(c.category_id), c.category_name || ''])
    : []);
  return streams
    .filter((s) => {
      const name = String(s.name || '');
      const cat = String(catMap.get(String(s.category_id)) || '');
      return /be\s*in|bein/i.test(name) && (/sport|sports/i.test(name) || /sport|sports/i.test(cat));
    })
    .map((s, index) => {
      const category = String(catMap.get(String(s.category_id)) || 'BeIN Sports').trim() || 'BeIN Sports';
      return {
        name: String(s.name || `BeIN Sports ${s.stream_id}`).trim(),
        stream_id: String(s.stream_id),
        logo_url: String(s.stream_icon || '').trim(),
        category,
        sort_order: 10000 + index,
      };
    });
}

function hydraBeinChannelsFromFile() {
  const file = arg('file', 'scripts/hydra-bein-channels.json');
  const resolved = path.isAbsolute(file) ? file : path.join(__dirname, '..', file);
  const rows = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!Array.isArray(rows)) throw new Error(`Hydra channel file must contain an array: ${resolved}`);
  return rows;
}

async function importHydraBein(sql, { fromFile = false } = {}) {
  const cfg = hydraConfig();
  const limitBytes = Math.max(0, Number(arg('limit-bytes', '0')) || 0);
  const channels = fromFile ? hydraBeinChannelsFromFile() : await hydraBeinChannelsFromProvider();

  if (!channels.length) throw new Error('No beIN Sports channels found in Hydra stream list.');

  const deleted = await sql`
    delete from cloud_iptv_channels
    where url like ${`${cfg.base}/live/${cfg.username}/%`}
      and (name ilike '%bein%' or name ilike '%beIN%' or name ilike '%be in%')
    returning id
  `;

  for (const ch of channels) {
    const streamId = String(ch.stream_id || ch.streamId || '').trim();
    if (!streamId) throw new Error(`Missing stream_id for channel: ${ch.name || 'unknown'}`);
    const url = `${cfg.base}/live/${encodeURIComponent(cfg.username)}/${encodeURIComponent(cfg.password)}/${encodeURIComponent(streamId)}.m3u8`;
    await sql`
      insert into cloud_iptv_channels
        (name, url, logo_url, category, headers, transfer_limit_bytes, is_active, sort_order)
      values
        (${ch.name}, ${url}, ${ch.logo_url || ''}, ${ch.category || 'BeIN Sports'}, ${JSON.stringify({})}::jsonb, ${limitBytes}, true, ${Number(ch.sort_order) || 10000})
    `;
  }

  const rows = await sql`
    select id, name, category, sort_order
    from cloud_iptv_channels
    where url like ${`${cfg.base}/live/${cfg.username}/%`}
      and (name ilike '%bein%' or name ilike '%beIN%' or name ilike '%be in%')
    order by sort_order asc
    limit 20
  `;
  console.log(`Imported ${channels.length} Hydra beIN Sports channels. Removed previous imports: ${deleted.length}.`);
  console.log(`Transfer limit per channel: ${limitBytes} bytes (${limitBytes === 0 ? 'unlimited' : 'limited'}).`);
  for (const row of rows) console.log(`${row.sort_order}\t${row.category}\t${row.name}`);
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
    const statements = splitSqlStatements(schema);
    for (const statement of statements) await sql.query(statement);
    console.log(`Schema applied (${statements.length} statements).`);
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

  if (cmd === 'import-hydra-bein') {
    await importHydraBein(sql);
    return;
  }

  if (cmd === 'import-hydra-bein-file') {
    await importHydraBein(sql, { fromFile: true });
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
