const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'webui/src/components/WivaApp.tsx'), 'utf8');
const cloudIptv = fs.readFileSync(path.join(root, 'library/cloud-iptv.cjs'), 'utf8');
const scanner = fs.readFileSync(path.join(root, 'library/scanner.cjs'), 'utf8');
const iptv = fs.readFileSync(path.join(root, 'library/iptv.cjs'), 'utf8');
const tmdb = fs.readFileSync(path.join(root, 'library/tmdb.cjs'), 'utf8');
const liveStatus = fs.readFileSync(path.join(root, 'webui/src/hooks/useLiveStatus.ts'), 'utf8');
const viewerLayout = fs.readFileSync(path.join(root, 'webui/src/components/ViewerLayout.tsx'), 'utf8');
const signaling = fs.readFileSync(path.join(root, 'server/signaling.cjs'), 'utf8');
const layouts = fs.readFileSync(path.join(root, 'webui/src/styles/layouts.css'), 'utf8');
const theme = fs.readFileSync(path.join(root, 'webui/src/styles/theme.css'), 'utf8');
const setupLayout = fs.readFileSync(path.join(root, 'webui/src/components/SetupLayout.tsx'), 'utf8');
const adminLayout = fs.readFileSync(path.join(root, 'webui/src/components/AdminLayout.tsx'), 'utf8');

assert.match(app, /import \{ lazy, Suspense,/);
assert.match(app, /import \{ ViewerHome \} from "@\/screens\/viewer\/Home"/);
assert.match(app, /import \{ Live \} from "@\/screens\/viewer\/Live"/);
assert.match(app, /import \{ WatchChannel \} from "@\/screens\/viewer\/WatchChannel"/);
assert.match(app, /const AdminDashboard = lazy\(/);
assert.match(app, /const SetupWelcome = lazy\(/);
assert.match(app, /<Suspense fallback=\{loading\}>/);
assert.doesNotMatch(app, /import \{ AdminDashboard \} from "@\/screens\//);
assert.doesNotMatch(app, /import \{ SetupWelcome \} from "@\/screens\//);

assert.match(cloudIptv, /if \(refreshPromise\) return refreshPromise/);
assert.match(cloudIptv, /refreshPromise = performRefresh\(licenseKey\)\.finally/);
assert.match(cloudIptv, /timer\.unref/);
assert.match(cloudIptv, /AbortSignal\.timeout\(12000\)/);

assert.match(scanner, /await fs\.promises\.readdir/);
assert.match(scanner, /if \(activeScanPromise\) \{[\s\S]*?queuedScan = \{ options, onProgress \}/);
assert.match(scanner, /existingByPath/);
assert.doesNotMatch(scanner, /fs\.readdirSync/);

assert.match(iptv, /HLS_VOD_PLAYLIST_CACHE_MS = 10 \* 60 \* 1000/);
assert.match(iptv, /HLS_PLAYLIST_TIMEOUT_MS = 10000/);
assert.match(iptv, /HLS_SEGMENT_TIMEOUT_MS = 15000/);
assert.match(iptv, /playlistCacheLifetime/);
assert.match(iptv, /effectiveTtlMs/);

assert.match(tmdb, /AbortSignal\.timeout\(8000\)/);
assert.match(tmdb, /const CACHE = new Map\(\)/);

assert.doesNotMatch(liveStatus, /path\.replace\([\s\S]*?\/api\/live\/ws/);
assert.match(liveStatus, /wsPath \? connectWs : connectSse/);
assert.doesNotMatch(viewerLayout, /<LiveIndicator/);
assert.match(signaling, /\/api\\\/live/);
assert.match(theme, /--bg-0:\s*#080b12/);
assert.match(theme, /--gold:\s*#d8c69e/);
assert.match(layouts, /\.mobile-bottom-nav[\s\S]*?safe-area-inset-bottom/);
assert.match(layouts, /@media \(max-width:\s*860px\)[\s\S]*?\.setup-steps[\s\S]*?overflow-x:\s*auto/);
assert.match(setupLayout, /className="setup-steps"/);
assert.match(adminLayout, /type LucideIcon/);
assert.doesNotMatch(adminLayout, /📊|🩺|📺|🎥|🛰️|🎬|💾|🗂️/);

console.log('WIVA web UI performance safeguards passed');
