const fs = require('fs');
const path = require('path');

function parseEnvValue(raw) {
  let value = String(raw || '').trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
}

function loadEnvFile(file) {
  if (!file || !fs.existsSync(file)) return false;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] !== undefined) continue;
    process.env[key] = parseEnvValue(match[2]);
  }
  return true;
}

function candidateFiles(appDir = __dirname) {
  const electronDir = path.resolve(appDir, '..');
  const repoDir = path.resolve(electronDir, '..');
  return [
    path.join(repoDir, '.env'),
    path.join(repoDir, '.env.local'),
    path.join(electronDir, '.env'),
    path.join(electronDir, '.env.local'),
  ];
}

function loadLocalEnv(appDir = __dirname) {
  const loaded = [];
  for (const file of candidateFiles(appDir)) {
    if (loadEnvFile(file)) loaded.push(file);
  }
  return loaded;
}

function runtimeConfigFromEnv() {
  return {
    neonDatabaseUrl: process.env.MANARA_NEON_DATABASE_URL || process.env.DATABASE_URL || '',
    sentryDsn: process.env.SENTRY_DSN || '',
    supabaseUrl: process.env.MANARA_SUPABASE_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    supabaseAnonKey: process.env.MANARA_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
  };
}

module.exports = { loadLocalEnv, runtimeConfigFromEnv };
