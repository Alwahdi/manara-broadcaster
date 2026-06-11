// Manara — local media library DB
// IPTV + broadcast channels: ALWAYS stored as JSON (small, no schema needed).
//   This eliminates the "channels disappear" bug caused by native better-sqlite3
//   failing to load in some Windows environments (antivirus quarantine of the
//   .node file, unpacked-asar path issues, ABI mismatch after auto-update).
// Media library (potentially thousands of items): uses SQLite when available,
//   falls back to JSON if not. Media data is rebuilt from disk by scanner so a
//   reset is harmless.
const path = require('path');
const fs = require('fs');

let Database;
try { Database = require('better-sqlite3'); } catch (e) { Database = null; }

let _db = null;

// ---------- Channel JSON store (independent of sqlite) ----------
let _channelsPath = null;
let _channels = { broadcast: [], iptv: [] };
let _lastChannelSaveError = '';

function hasChannelData(value) {
  return !!value && (
    (Array.isArray(value.broadcast) && value.broadcast.length > 0) ||
    (Array.isArray(value.iptv) && value.iptv.length > 0)
  );
}

function emptyMarkerPath() {
  return _channelsPath ? _channelsPath + '.empty-ok' : null;
}

function markEmptyIfIntentional() {
  const marker = emptyMarkerPath();
  if (!marker) return;
  try {
    if (hasChannelData(_channels)) {
      if (fs.existsSync(marker)) fs.unlinkSync(marker);
    } else {
      fs.writeFileSync(marker, String(Date.now()));
    }
  } catch {}
}

function readJsonFile(p) {
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return raw && typeof raw === 'object' ? raw : null;
}

function reloadChannelsFromDisk() {
  if (!_channelsPath) return;
  try {
    if (!fs.existsSync(_channelsPath)) return;
    const raw = readJsonFile(_channelsPath);
    if (!raw || typeof raw !== 'object') return;
    if (Array.isArray(raw.broadcast)) _channels.broadcast = raw.broadcast;
    if (Array.isArray(raw.iptv)) _channels.iptv = raw.iptv;
  } catch (e) {
    console.warn('[Manara] reloadChannelsFromDisk failed:', e.message);
  }
}

function loadChannelsFile(seed = {}) {
  if (!_channelsPath) return;
  try {
    if (fs.existsSync(_channelsPath)) {
      const raw = readJsonFile(_channelsPath);
      if (raw && typeof raw === 'object') {
        if (Array.isArray(raw.broadcast)) _channels.broadcast = raw.broadcast;
        if (Array.isArray(raw.iptv)) _channels.iptv = raw.iptv;
      }
      const bak = _channelsPath + '.bak';
      if (!hasChannelData(_channels) && !fs.existsSync(emptyMarkerPath()) && fs.existsSync(bak)) {
        const backupRaw = readJsonFile(bak);
        if (hasChannelData(backupRaw)) {
          if (Array.isArray(backupRaw.broadcast)) _channels.broadcast = backupRaw.broadcast;
          if (Array.isArray(backupRaw.iptv)) _channels.iptv = backupRaw.iptv;
          console.warn('[Manara] recovered channels from non-empty backup:', bak);
          saveChannelsFile();
        }
      }
      console.log('[Manara] channels loaded from', _channelsPath,
        '— broadcast:', _channels.broadcast.length, 'iptv:', _channels.iptv.length);
    } else {
      console.log('[Manara] no existing channels file (first run) at', _channelsPath);
    }
    if ((!_channels.broadcast.length) && Array.isArray(seed.broadcast) && seed.broadcast.length) {
      _channels.broadcast = seed.broadcast;
      saveChannelsFile();
      console.warn('[Manara] restored broadcast channels from settings mirror:', _channels.broadcast.length);
    }
    if ((!_channels.iptv.length) && Array.isArray(seed.iptv) && seed.iptv.length) {
      _channels.iptv = seed.iptv;
      saveChannelsFile();
      console.warn('[Manara] restored IPTV channels from settings mirror:', _channels.iptv.length);
    }
  } catch (e) {
    console.error('[Manara] channels file read failed:', e.message);
    try {
      const bak = _channelsPath + '.bak';
      if (fs.existsSync(bak)) {
        const raw = readJsonFile(bak);
        if (Array.isArray(raw.broadcast)) _channels.broadcast = raw.broadcast;
        if (Array.isArray(raw.iptv)) _channels.iptv = raw.iptv;
        console.warn('[Manara] recovered channels from backup:', bak);
        saveChannelsFile();
      }
    } catch (backupError) {
      console.error('[Manara] channels backup recovery failed:', backupError.message);
    }
  }
}

function saveChannelsFile() {
  if (!_channelsPath) return false;
  try {
    fs.mkdirSync(path.dirname(_channelsPath), { recursive: true });
    // Keep a rolling backup so a corrupted write can be recovered manually.
    if (fs.existsSync(_channelsPath)) {
      try { fs.copyFileSync(_channelsPath, _channelsPath + '.bak'); } catch {}
    }
    const tmp = _channelsPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(_channels, null, 2));
    fs.renameSync(tmp, _channelsPath);
    markEmptyIfIntentional();
    _lastChannelSaveError = '';
    return true;
  } catch (e) {
    _lastChannelSaveError = e.message;
    console.error('[Manara] channels file write failed:', e.message);
    throw e;
  }
}

// ---------- Media library (sqlite preferred, JSON fallback) ----------
let _mediaFallbackPath = null;
let _mediaFallback = { media_items: [], library_paths: [], watch_progress: {}, subtitles: [] };
function loadMediaFallback(dbPath) {
  _mediaFallbackPath = dbPath + '.media.json';
  try {
    if (fs.existsSync(_mediaFallbackPath)) {
      _mediaFallback = { ..._mediaFallback, ...JSON.parse(fs.readFileSync(_mediaFallbackPath, 'utf8')) };
    }
    if (!_mediaFallback.watch_progress || typeof _mediaFallback.watch_progress !== 'object') _mediaFallback.watch_progress = {};
    if (!Array.isArray(_mediaFallback.subtitles)) _mediaFallback.subtitles = [];
  } catch (e) { console.error('[Manara] media fallback read failed:', e.message); }
}
function saveMediaFallback() {
  if (!_mediaFallbackPath) return;
  try {
    fs.mkdirSync(path.dirname(_mediaFallbackPath), { recursive: true });
    const tmp = _mediaFallbackPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(_mediaFallback, null, 2));
    fs.renameSync(tmp, _mediaFallbackPath);
  } catch (e) { console.error('[Manara] media fallback write failed:', e.message); }
}

function init(dbPath, seed = {}) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  // Channels file lives next to the db, but is independent of sqlite.
  _channelsPath = path.join(path.dirname(dbPath), 'manara-channels.json');
  loadChannelsFile(seed);
  loadAdminState(path.dirname(dbPath));

  if (!Database) {
    loadMediaFallback(dbPath);
    console.warn('[Manara] better-sqlite3 not available; media library uses JSON fallback');
    return null;
  }
  try {
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.exec(`
    CREATE TABLE IF NOT EXISTS library_paths (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL DEFAULT 'movies',
      locked INTEGER NOT NULL DEFAULT 0,
      added_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS media_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      year INTEGER,
      season INTEGER,
      episode INTEGER,
      tmdb_id INTEGER,
      poster_url TEXT,
      backdrop_url TEXT,
      overview TEXT,
      rating REAL,
      duration INTEGER,
      size INTEGER,
      added_at INTEGER NOT NULL,
      scanned_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_media_kind ON media_items(kind);
    CREATE INDEX IF NOT EXISTS idx_media_title ON media_items(title);
    CREATE TABLE IF NOT EXISTS watch_progress (
      media_id INTEGER PRIMARY KEY REFERENCES media_items(id) ON DELETE CASCADE,
      position REAL NOT NULL DEFAULT 0,
      duration REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS subtitles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_id INTEGER NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
      lang TEXT NOT NULL,
      path TEXT NOT NULL,
      label TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_subs_media ON subtitles(media_id);
    `);
    console.log('[Manara] sqlite media library ready at', dbPath);
    return _db;
  } catch (e) {
    console.error('[Manara] sqlite init failed, using JSON fallback for media:', e.message);
    _db = null;
    loadMediaFallback(dbPath);
    return null;
  }
}

function db() {
  if (!_db) throw new Error('Media library sqlite not available');
  return _db;
}

// ---- library paths ----
function listPaths() {
  if (!_db) return _mediaFallback.library_paths.slice();
  return db().prepare('SELECT * FROM library_paths ORDER BY id').all();
}
function addPath(p, kind = 'movies', locked = 0) {
  if (!_db) {
    if (!_mediaFallback.library_paths.find((r) => r.path === p)) {
      const id = (_mediaFallback.library_paths.reduce((m, r) => Math.max(m, r.id || 0), 0)) + 1;
      _mediaFallback.library_paths.push({ id, path: p, kind, locked: locked ? 1 : 0, added_at: Date.now() });
      saveMediaFallback();
    }
    return;
  }
  db().prepare('INSERT OR IGNORE INTO library_paths (path, kind, locked, added_at) VALUES (?,?,?,?)')
    .run(p, kind, locked ? 1 : 0, Date.now());
}
function removePath(id) {
  if (!_db) {
    _mediaFallback.library_paths = _mediaFallback.library_paths.filter((r) => r.id !== id || r.locked);
    saveMediaFallback();
    return;
  }
  db().prepare('DELETE FROM library_paths WHERE id = ? AND locked = 0').run(id);
}

// ---- media ----
function upsertMedia(item) {
  if (!_db) {
    const now = Date.now();
    const existing = _mediaFallback.media_items.find((r) => r.path === item.path);
    if (existing) {
      Object.assign(existing, {
        kind: item.kind,
        title: item.title,
        year: item.year ?? null,
        season: item.season ?? null,
        episode: item.episode ?? null,
        tmdb_id: item.tmdb_id ?? null,
        poster_url: item.poster_url ?? null,
        backdrop_url: item.backdrop_url ?? null,
        overview: item.overview ?? null,
        rating: item.rating ?? null,
        duration: item.duration ?? null,
        size: item.size ?? null,
        scanned_at: now,
      });
      saveMediaFallback();
      return existing.id;
    }
    const id = (_mediaFallback.media_items.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0)) + 1;
    _mediaFallback.media_items.push({
      id,
      path: item.path,
      kind: item.kind,
      title: item.title,
      year: item.year ?? null,
      season: item.season ?? null,
      episode: item.episode ?? null,
      tmdb_id: item.tmdb_id ?? null,
      poster_url: item.poster_url ?? null,
      backdrop_url: item.backdrop_url ?? null,
      overview: item.overview ?? null,
      rating: item.rating ?? null,
      duration: item.duration ?? null,
      size: item.size ?? null,
      added_at: now,
      scanned_at: now,
    });
    saveMediaFallback();
    return id;
  }
  const now = Date.now();
  const existing = db().prepare('SELECT id, added_at FROM media_items WHERE path = ?').get(item.path);
  if (existing) {
    db().prepare(`UPDATE media_items SET kind=?, title=?, year=?, season=?, episode=?, tmdb_id=?,
      poster_url=?, backdrop_url=?, overview=?, rating=?, duration=?, size=?, scanned_at=? WHERE id=?`).run(
      item.kind, item.title, item.year ?? null, item.season ?? null, item.episode ?? null,
      item.tmdb_id ?? null, item.poster_url ?? null, item.backdrop_url ?? null,
      item.overview ?? null, item.rating ?? null, item.duration ?? null, item.size ?? null,
      now, existing.id);
    return existing.id;
  }
  const r = db().prepare(`INSERT INTO media_items
    (path, kind, title, year, season, episode, tmdb_id, poster_url, backdrop_url, overview, rating, duration, size, added_at, scanned_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    item.path, item.kind, item.title, item.year ?? null, item.season ?? null, item.episode ?? null,
    item.tmdb_id ?? null, item.poster_url ?? null, item.backdrop_url ?? null,
    item.overview ?? null, item.rating ?? null, item.duration ?? null, item.size ?? null, now, now);
  return r.lastInsertRowid;
}
function listMedia({ kind, q, limit = 200 } = {}) {
  if (!_db) {
    const query = String(q || '').trim().toLowerCase();
    return _mediaFallback.media_items
      .filter((item) => !kind || item.kind === kind)
      .filter((item) => !query || String(item.title || '').toLowerCase().includes(query))
      .sort((a, b) => Number(b.added_at || 0) - Number(a.added_at || 0))
      .slice(0, Math.max(1, Number(limit) || 200))
      .map((item) => {
        const progress = _mediaFallback.watch_progress[String(item.id)] || {};
        return { ...item, position: progress.position || 0, wp_duration: progress.duration || 0 };
      });
  }
  let sql = `SELECT m.*, wp.position, wp.duration AS wp_duration FROM media_items m
             LEFT JOIN watch_progress wp ON wp.media_id = m.id WHERE 1=1`;
  const params = [];
  if (kind) { sql += ' AND m.kind = ?'; params.push(kind); }
  if (q) { sql += ' AND m.title LIKE ?'; params.push('%' + q + '%'); }
  sql += ' ORDER BY m.added_at DESC LIMIT ?';
  params.push(limit);
  return db().prepare(sql).all(...params);
}
function getMedia(id) {
  if (!_db) {
    const item = _mediaFallback.media_items.find((r) => String(r.id) === String(id)) || null;
    if (!item) return null;
    const progress = _mediaFallback.watch_progress[String(item.id)] || {};
    return { ...item, position: progress.position || 0, wp_duration: progress.duration || 0 };
  }
  return db().prepare(`SELECT m.*, wp.position, wp.duration AS wp_duration
    FROM media_items m
    LEFT JOIN watch_progress wp ON wp.media_id = m.id
    WHERE m.id = ?`).get(id);
}
function updateMedia(id, patch = {}) {
  const cur = getMedia(id);
  if (!cur) return null;
  const clean = {
    title: String(patch.title ?? cur.title ?? '').trim() || cur.title,
    kind: ['movie', 'episode', 'audio'].includes(patch.kind) ? patch.kind : cur.kind,
    year: patch.year === '' || patch.year == null ? null : Number(patch.year) || null,
    season: patch.season === '' || patch.season == null ? null : Number(patch.season) || null,
    episode: patch.episode === '' || patch.episode == null ? null : Number(patch.episode) || null,
    poster_url: patch.poster_url ?? cur.poster_url ?? null,
    backdrop_url: patch.backdrop_url ?? cur.backdrop_url ?? null,
    overview: patch.overview ?? cur.overview ?? null,
    rating: patch.rating === '' || patch.rating == null ? null : Number(patch.rating) || null,
  };
  if (!_db) {
    _mediaFallback.media_items = _mediaFallback.media_items.map((item) => String(item.id) === String(id)
      ? { ...item, ...clean, scanned_at: Date.now() }
      : item);
    saveMediaFallback();
    return getMedia(id);
  }
  db().prepare(`UPDATE media_items SET kind=?, title=?, year=?, season=?, episode=?,
    poster_url=?, backdrop_url=?, overview=?, rating=?, scanned_at=? WHERE id=?`).run(
    clean.kind, clean.title, clean.year, clean.season, clean.episode,
    clean.poster_url, clean.backdrop_url, clean.overview, clean.rating, Date.now(), id);
  return getMedia(id);
}
function removeMedia(id, { deleteFile = false } = {}) {
  const item = getMedia(id);
  if (!item) return false;
  if (deleteFile) {
    try { if (fs.existsSync(item.path)) fs.unlinkSync(item.path); } catch (e) { throw new Error(`Could not delete media file: ${e.message}`); }
  }
  if (!_db) {
    _mediaFallback.media_items = _mediaFallback.media_items.filter((row) => String(row.id) !== String(id));
    _mediaFallback.subtitles = _mediaFallback.subtitles.filter((sub) => String(sub.media_id) !== String(id));
    delete _mediaFallback.watch_progress[String(id)];
    saveMediaFallback();
    return true;
  }
  db().prepare('DELETE FROM subtitles WHERE media_id = ?').run(id);
  db().prepare('DELETE FROM watch_progress WHERE media_id = ?').run(id);
  db().prepare('DELETE FROM media_items WHERE id = ?').run(id);
  return true;
}
function mediaStats() {
  const items = listMedia({ limit: 100000 });
  const logs = listAccessLogs(600).filter((log) => log.targetType === 'media');
  const byMedia = new Map();
  for (const item of items) {
    byMedia.set(String(item.id), {
      id: item.id,
      title: item.title,
      kind: item.kind,
      plays: 0,
      bytes: 0,
      lastAt: 0,
      size: Number(item.size) || 0,
      position: Number(item.position) || 0,
      duration: Number(item.wp_duration) || 0,
    });
  }
  for (const log of logs) {
    const key = String(log.targetId || '');
    if (!byMedia.has(key)) continue;
    const row = byMedia.get(key);
    if (log.action === 'media') row.plays += 1;
    row.bytes += Number(log.bytes) || 0;
    row.lastAt = Math.max(row.lastAt, Number(log.at) || 0);
  }
  const totalSize = items.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
  const byKind = items.reduce((acc, item) => {
    acc[item.kind || 'unknown'] = (acc[item.kind || 'unknown'] || 0) + 1;
    return acc;
  }, {});
  return {
    total: items.length,
    totalSize,
    byKind,
    top: Array.from(byMedia.values()).sort((a, b) => (b.plays - a.plays) || (b.bytes - a.bytes)).slice(0, 20),
    recent: logs.slice(0, 80),
  };
}
function deleteMissing(existingPaths) {
  if (!_db) {
    const keep = new Set(existingPaths || []);
    _mediaFallback.media_items = _mediaFallback.media_items.filter((item) => keep.has(item.path));
    const mediaIds = new Set(_mediaFallback.media_items.map((item) => String(item.id)));
    _mediaFallback.subtitles = _mediaFallback.subtitles.filter((sub) => mediaIds.has(String(sub.media_id)));
    for (const key of Object.keys(_mediaFallback.watch_progress)) {
      if (!mediaIds.has(String(key))) delete _mediaFallback.watch_progress[key];
    }
    saveMediaFallback();
    return;
  }
  if (!existingPaths.length) return;
  const placeholders = existingPaths.map(() => '?').join(',');
  db().prepare(`DELETE FROM media_items WHERE path NOT IN (${placeholders})`).run(...existingPaths);
}
function setProgress(mediaId, position, duration) {
  if (!_db) {
    _mediaFallback.watch_progress[String(mediaId)] = {
      media_id: Number(mediaId),
      position: Number(position) || 0,
      duration: Number(duration) || 0,
      updated_at: Date.now(),
    };
    saveMediaFallback();
    return;
  }
  db().prepare(`INSERT INTO watch_progress (media_id, position, duration, updated_at) VALUES (?,?,?,?)
    ON CONFLICT(media_id) DO UPDATE SET position=excluded.position, duration=excluded.duration, updated_at=excluded.updated_at`)
    .run(mediaId, position, duration, Date.now());
}
function addSubtitle(mediaId, lang, p, label) {
  if (!_db) {
    const exists = _mediaFallback.subtitles.find((sub) => String(sub.media_id) === String(mediaId) && sub.path === p);
    if (exists) return;
    const id = (_mediaFallback.subtitles.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0)) + 1;
    _mediaFallback.subtitles.push({ id, media_id: Number(mediaId), lang, path: p, label: label || null });
    saveMediaFallback();
    return;
  }
  db().prepare('INSERT INTO subtitles (media_id, lang, path, label) VALUES (?,?,?,?)').run(mediaId, lang, p, label || null);
}
function listSubtitles(mediaId) {
  if (!_db) return _mediaFallback.subtitles.filter((sub) => String(sub.media_id) === String(mediaId));
  return db().prepare('SELECT * FROM subtitles WHERE media_id = ?').all(mediaId);
}
function getSubtitle(id) {
  if (!_db) return _mediaFallback.subtitles.find((sub) => String(sub.id) === String(id)) || null;
  return db().prepare('SELECT * FROM subtitles WHERE id = ?').get(id);
}

// ---- LAN admin state (sessions, blocklist, access logs) ----
let _adminStatePath = null;
let _adminState = {
  sessions: {},
  blocks: [],
  logs: [],
  blockedMessage: 'Stream is not available right now.',
};

function normalizeAdminState(raw = {}) {
  return {
    sessions: raw.sessions && typeof raw.sessions === 'object' ? raw.sessions : {},
    blocks: Array.isArray(raw.blocks) ? raw.blocks : [],
    logs: Array.isArray(raw.logs) ? raw.logs.slice(-600) : [],
    blockedMessage: String(raw.blockedMessage || 'Stream is not available right now.').slice(0, 300),
  };
}

function loadAdminState(baseDir) {
  _adminStatePath = path.join(baseDir, 'manara-admin-state.json');
  try {
    if (fs.existsSync(_adminStatePath)) {
      _adminState = normalizeAdminState(JSON.parse(fs.readFileSync(_adminStatePath, 'utf8')));
    }
  } catch (e) {
    console.error('[Manara] admin state read failed:', e.message);
  }
}

function saveAdminState() {
  if (!_adminStatePath) return;
  try {
    fs.mkdirSync(path.dirname(_adminStatePath), { recursive: true });
    const tmp = _adminStatePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(_adminState, null, 2));
    fs.renameSync(tmp, _adminStatePath);
  } catch (e) {
    console.error('[Manara] admin state write failed:', e.message);
  }
}

function cleanSessionKey(value) {
  return String(value || '').trim().slice(0, 160) || 'unknown';
}

function addAccessLog(entry = {}) {
  const row = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    at: Date.now(),
    ip: cleanSessionKey(entry.ip),
    userAgent: String(entry.userAgent || '').slice(0, 300),
    action: String(entry.action || 'request').slice(0, 60),
    targetType: String(entry.targetType || '').slice(0, 40),
    targetId: String(entry.targetId || '').slice(0, 120),
    targetName: String(entry.targetName || '').slice(0, 180),
    bytes: Math.max(0, Number(entry.bytes) || 0),
    status: Number(entry.status) || 200,
    message: String(entry.message || '').slice(0, 240),
  };
  _adminState.logs.push(row);
  _adminState.logs = _adminState.logs.slice(-600);
  saveAdminState();
  return row;
}

function touchSession({ ip, userAgent, path: requestPath, targetType, targetId, targetName } = {}) {
  const key = cleanSessionKey(ip);
  const now = Date.now();
  const session = _adminState.sessions[key] || {
    ip: key,
    userAgent: '',
    firstSeenAt: now,
    lastSeenAt: now,
    requests: 0,
    bytes: 0,
    targets: {},
  };
  session.userAgent = String(userAgent || session.userAgent || '').slice(0, 300);
  session.path = String(requestPath || session.path || '').slice(0, 220);
  session.targetType = String(targetType || session.targetType || '').slice(0, 40);
  session.targetId = String(targetId || session.targetId || '').slice(0, 120);
  session.targetName = String(targetName || session.targetName || '').slice(0, 180);
  session.requests = Number(session.requests || 0) + 1;
  session.lastSeenAt = now;
  if (targetId) {
    const targetKey = `${targetType || 'stream'}:${targetId}`;
    session.targets[targetKey] = (Number(session.targets[targetKey]) || 0) + 1;
  }
  _adminState.sessions[key] = session;
  saveAdminState();
  return session;
}

function addSessionBytes(ip, bytes) {
  const key = cleanSessionKey(ip);
  const session = _adminState.sessions[key];
  if (!session) return;
  session.bytes = Number(session.bytes || 0) + Math.max(0, Number(bytes) || 0);
  session.lastSeenAt = Date.now();
  saveAdminState();
}

function listSessions() {
  return Object.values(_adminState.sessions)
    .sort((a, b) => Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0))
    .slice(0, 200);
}

function listAccessLogs(limit = 200) {
  return _adminState.logs.slice(-Math.max(1, Number(limit) || 200)).reverse();
}

function listBlocks() {
  return _adminState.blocks.slice().sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

function addBlock({ type = 'ip', identifier, reason = '' } = {}) {
  const cleanType = ['ip', 'userAgent'].includes(type) ? type : 'ip';
  const cleanIdentifier = cleanSessionKey(identifier);
  const existing = _adminState.blocks.find((b) => b.type === cleanType && b.identifier === cleanIdentifier);
  if (existing) return existing;
  const row = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    type: cleanType,
    identifier: cleanIdentifier,
    reason: String(reason || '').slice(0, 220),
    createdAt: Date.now(),
  };
  _adminState.blocks.push(row);
  saveAdminState();
  return row;
}

function removeBlock(id) {
  const before = _adminState.blocks.length;
  _adminState.blocks = _adminState.blocks.filter((b) => String(b.id) !== String(id));
  if (_adminState.blocks.length !== before) saveAdminState();
}

function isBlocked({ ip, userAgent } = {}) {
  const cleanIp = cleanSessionKey(ip);
  const ua = String(userAgent || '');
  return _adminState.blocks.find((b) => {
    if (b.type === 'ip') return b.identifier === cleanIp;
    if (b.type === 'userAgent') return ua.includes(b.identifier);
    return false;
  }) || null;
}

function blockedMessage() {
  return _adminState.blockedMessage || 'Stream is not available right now.';
}

function setBlockedMessage(message) {
  _adminState.blockedMessage = String(message || 'Stream is not available right now.').slice(0, 300);
  saveAdminState();
  return _adminState.blockedMessage;
}

// ---- iptv channels (JSON-backed, robust) ----
function listIptv() {
  return _channels.iptv.slice().sort((a, b) => Number(b.id) - Number(a.id));
}
function getIptv(id) {
  return _channels.iptv.find((r) => String(r.id) === String(id)) || null;
}
function cleanLimitBytes(value) {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  return Number.isFinite(n) ? n : 0;
}

function addIptv({ name, url, logo, category, enabled, transferLimitBytes }) {
  const nextId = _channels.iptv.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
  const row = {
    id: nextId,
    name,
    url,
    logo: logo || null,
    category: category || null,
    transferLimitBytes: cleanLimitBytes(transferLimitBytes),
    enabled: enabled === false || enabled === 0 ? 0 : 1,
    added_at: Date.now(),
  };
  _channels.iptv = [row, ..._channels.iptv];
  saveChannelsFile();
  return nextId;
}
function updateIptv(id, patch) {
  const cur = getIptv(id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  _channels.iptv = _channels.iptv.map((r) => String(r.id) === String(id)
    ? {
      ...r,
      name: next.name,
      url: next.url,
      logo: next.logo || null,
      category: next.category || null,
      transferLimitBytes: cleanLimitBytes(next.transferLimitBytes),
      enabled: next.enabled === false || next.enabled === 0 ? 0 : 1,
    }
    : r);
  saveChannelsFile();
  return getIptv(id);
}
function removeIptv(id) {
  _channels.iptv = _channels.iptv.filter((r) => String(r.id) !== String(id));
  saveChannelsFile();
}

// ---- broadcast channels (JSON-backed, robust) ----
function listBroadcastChannels() {
  return _channels.broadcast.slice();
}
function upsertBroadcastChannel(channel) {
  const existing = _channels.broadcast.find((r) => r.id === channel.id);
  const clean = {
    id: channel.id,
    name: channel.name,
    description: channel.description || '',
    source: channel.source || {},
    audioDeviceId: channel.audioDeviceId || 'none',
    resolution: channel.resolution || '1280x720',
    fps: channel.fps || 30,
    bitrateKbps: channel.bitrateKbps || 2500,
    autoStart: !!channel.autoStart,
    enabled: channel.enabled !== false,
  };
  _channels.broadcast = existing
    ? _channels.broadcast.map((r) => r.id === channel.id ? clean : r)
    : [..._channels.broadcast, clean];
  saveChannelsFile();
  return clean;
}
function setBroadcastChannels(channels) {
  if (!Array.isArray(channels)) return listBroadcastChannels();
  _channels.broadcast = channels.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description || '',
    source: c.source || {},
    audioDeviceId: c.audioDeviceId || 'none',
    resolution: c.resolution || '1280x720',
    fps: c.fps || 30,
    bitrateKbps: c.bitrateKbps || 2500,
    autoStart: !!c.autoStart,
    enabled: c.enabled !== false,
  }));
  saveChannelsFile();
  return listBroadcastChannels();
}
function removeBroadcastChannel(id) {
  _channels.broadcast = _channels.broadcast.filter((r) => r.id !== id);
  saveChannelsFile();
}

function replaceAllChannels({ broadcast, iptv } = {}) {
  if (Array.isArray(broadcast)) {
    _channels.broadcast = broadcast.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description || '',
      source: c.source || {},
      audioDeviceId: c.audioDeviceId || 'none',
      resolution: c.resolution || '1280x720',
      fps: c.fps || 30,
      bitrateKbps: c.bitrateKbps || 2500,
      autoStart: !!c.autoStart,
      enabled: c.enabled !== false,
    }));
  }
  if (Array.isArray(iptv)) {
    _channels.iptv = iptv.map((c, idx) => ({
      id: Number(c.id) || idx + 1,
      name: c.name || `IPTV ${idx + 1}`,
      url: c.url || '',
      logo: c.logo || null,
      category: c.category || null,
      transferLimitBytes: cleanLimitBytes(c.transferLimitBytes),
      enabled: c.enabled === false || c.enabled === 0 ? 0 : 1,
      added_at: Number(c.added_at) || Date.now(),
    })).filter((c) => c.url);
  }
  saveChannelsFile();
  return exportChannels();
}

function exportChannels() {
  return {
    broadcast: listBroadcastChannels(),
    iptv: listIptv(),
  };
}

function diagnostics() {
  return {
    channelsPath: _channelsPath,
    channelsExists: _channelsPath ? fs.existsSync(_channelsPath) : false,
    broadcastCount: _channels.broadcast.length,
    iptvCount: _channels.iptv.length,
    lastChannelSaveError: _lastChannelSaveError,
    sqliteAvailable: !!_db,
    mediaFallbackPath: _mediaFallbackPath,
    adminStatePath: _adminStatePath,
  };
}

module.exports = {
  init, diagnostics, reloadChannelsFromDisk,
  listPaths, addPath, removePath,
  upsertMedia, listMedia, getMedia, updateMedia, removeMedia, mediaStats, deleteMissing,
  setProgress, addSubtitle, listSubtitles, getSubtitle,
  listIptv, getIptv, addIptv, updateIptv, removeIptv,
  listBroadcastChannels, upsertBroadcastChannel, setBroadcastChannels, removeBroadcastChannel,
  touchSession, addSessionBytes, addAccessLog, listSessions, listAccessLogs,
  listBlocks, addBlock, removeBlock, isBlocked, blockedMessage, setBlockedMessage,
  replaceAllChannels, exportChannels,
};
