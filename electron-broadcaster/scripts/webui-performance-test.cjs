const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'webui/src/components/WivaApp.tsx'), 'utf8');
const cloudIptv = fs.readFileSync(path.join(root, 'library/cloud-iptv.cjs'), 'utf8');
const scanner = fs.readFileSync(path.join(root, 'library/scanner.cjs'), 'utf8');
const iptv = fs.readFileSync(path.join(root, 'library/iptv.cjs'), 'utf8');
const tmdb = fs.readFileSync(path.join(root, 'library/tmdb.cjs'), 'utf8');

assert.match(app, /import \{ lazy, Suspense,/);
assert.match(app, /const ViewerHome = lazy\(/);
assert.match(app, /const AdminDashboard = lazy\(/);
assert.match(app, /const SetupWelcome = lazy\(/);
assert.match(app, /<Suspense fallback=\{loading\}>/);
assert.doesNotMatch(app, /import \{[^\n]+\} from "@\/screens\//);

assert.match(cloudIptv, /if \(refreshPromise\) return refreshPromise/);
assert.match(cloudIptv, /refreshPromise = performRefresh\(licenseKey\)\.finally/);
assert.match(cloudIptv, /timer\.unref/);
assert.match(cloudIptv, /AbortSignal\.timeout\(12000\)/);

assert.match(scanner, /await fs\.promises\.readdir/);
assert.match(scanner, /if \(activeScanPromise\) \{[\s\S]*?queuedScan = \{ options, onProgress \}/);
assert.match(scanner, /existingByPath/);
assert.doesNotMatch(scanner, /fs\.readdirSync/);

assert.match(iptv, /HLS_VOD_PLAYLIST_CACHE_MS = 10 \* 60 \* 1000/);
assert.match(iptv, /playlistCacheLifetime/);
assert.match(iptv, /effectiveTtlMs/);

assert.match(tmdb, /AbortSignal\.timeout\(8000\)/);
assert.match(tmdb, /const CACHE = new Map\(\)/);

console.log('WIVA web UI performance safeguards passed');
