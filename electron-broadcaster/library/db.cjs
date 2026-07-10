// WIVA — local media library DB
// IPTV + broadcast channels: ALWAYS stored as JSON (small, no schema needed).
//   This eliminates the "channels disappear" bug caused by native better-sqlite3
//   failing to load in some Windows environments (antivirus quarantine of the
//   .node file, unpacked-asar path issues, ABI mismatch after auto-update).
// Media library (potentially thousands of items): uses SQLite when available,
//   falls back to JSON if not. Media data is rebuilt from disk by scanner so a
//   reset is harmless.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { writeJsonAtomic } = require('./atomic-write.cjs');

let Database;
try { Database = require('better-sqlite3'); } catch (e) { Database = null; }

let _db = null;
let _mediaRevision = 1;

function bumpMediaRevision() {
  _mediaRevision += 1;
}

function mediaRevision() {
  return _mediaRevision;
}

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
    console.warn('[WIVA] reloadChannelsFromDisk failed:', e.message);
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
          console.warn('[WIVA] recovered channels from non-empty backup:', bak);
          saveChannelsFile();
        }
      }
      console.log('[WIVA] channels loaded from', _channelsPath,
        '— broadcast:', _channels.broadcast.length, 'iptv:', _channels.iptv.length);
    } else {
      console.log('[WIVA] no existing channels file (first run) at', _channelsPath);
    }
    if ((!_channels.broadcast.length) && Array.isArray(seed.broadcast) && seed.broadcast.length) {
      _channels.broadcast = seed.broadcast;
      saveChannelsFile();
      console.warn('[WIVA] restored broadcast channels from settings mirror:', _channels.broadcast.length);
    }
    if ((!_channels.iptv.length) && Array.isArray(seed.iptv) && seed.iptv.length) {
      _channels.iptv = seed.iptv;
      saveChannelsFile();
      console.warn('[WIVA] restored IPTV channels from settings mirror:', _channels.iptv.length);
    }
  } catch (e) {
    console.error('[WIVA] channels file read failed:', e.message);
    try {
      const bak = _channelsPath + '.bak';
      if (fs.existsSync(bak)) {
        const raw = readJsonFile(bak);
        if (Array.isArray(raw.broadcast)) _channels.broadcast = raw.broadcast;
        if (Array.isArray(raw.iptv)) _channels.iptv = raw.iptv;
        console.warn('[WIVA] recovered channels from backup:', bak);
        saveChannelsFile();
      }
    } catch (backupError) {
      console.error('[WIVA] channels backup recovery failed:', backupError.message);
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
    writeJsonAtomic(_channelsPath, _channels);
    markEmptyIfIntentional();
    _lastChannelSaveError = '';
    return true;
  } catch (e) {
    _lastChannelSaveError = e.message;
    console.error('[WIVA] channels file write failed:', e.message);
    throw e;
  }
}

// ---------- Media library (sqlite preferred, JSON fallback) ----------
let _mediaFallbackPath = null;
let _mediaFallback = { media_items: [], library_paths: [], watch_progress: {}, subtitles: [] };
function normalizePathList(value) {
  let raw = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = raw.split(/\r?\n|,/); }
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .filter((entry) => {
      const key = entry.replace(/[\\/]+$/g, '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 200);
}
function serializePathList(value) {
  return JSON.stringify(normalizePathList(value));
}
function publicLibraryPath(row = {}) {
  const excludePaths = normalizePathList(row.exclude_paths ?? row.excludePaths ?? []);
  return {
    ...row,
    exclude_paths: excludePaths,
    excludePaths,
  };
}
function loadMediaFallback(dbPath) {
  _mediaFallbackPath = dbPath + '.media.json';
  try {
    if (fs.existsSync(_mediaFallbackPath)) {
      _mediaFallback = { ..._mediaFallback, ...JSON.parse(fs.readFileSync(_mediaFallbackPath, 'utf8')) };
    }
    if (!_mediaFallback.watch_progress || typeof _mediaFallback.watch_progress !== 'object') _mediaFallback.watch_progress = {};
    if (!Array.isArray(_mediaFallback.subtitles)) _mediaFallback.subtitles = [];
    if (!Array.isArray(_mediaFallback.library_paths)) _mediaFallback.library_paths = [];
    _mediaFallback.library_paths = _mediaFallback.library_paths.map((row) => ({
      ...row,
      exclude_paths: normalizePathList(row.exclude_paths ?? row.excludePaths ?? []),
    }));
  } catch (e) { console.error('[WIVA] media fallback read failed:', e.message); }
}
function saveMediaFallback() {
  if (!_mediaFallbackPath) return;
  try {
    writeJsonAtomic(_mediaFallbackPath, _mediaFallback);
  } catch (e) { console.error('[WIVA] media fallback write failed:', e.message); }
}

function init(dbPath, seed = {}) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  // Channels file lives next to the db, but is independent of sqlite.
  _channelsPath = path.join(path.dirname(dbPath), 'manara-channels.json');
  loadChannelsFile(seed);
  loadAdminState(path.dirname(dbPath));

  if (!Database) {
    loadMediaFallback(dbPath);
    console.warn('[WIVA] better-sqlite3 not available; media library uses JSON fallback');
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
      added_at INTEGER NOT NULL,
      label TEXT,
      status TEXT NOT NULL DEFAULT 'connected',
      last_scan_at INTEGER,
      last_error TEXT,
      exclude_paths TEXT NOT NULL DEFAULT '[]',
      file_count INTEGER NOT NULL DEFAULT 0,
      folder_count INTEGER NOT NULL DEFAULT 0
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
      section TEXT,
      folder TEXT,
      remote_url TEXT,
      source_id INTEGER,
      source_path TEXT,
      source_label TEXT,
      relative_path TEXT,
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
    for (const ddl of [
      'ALTER TABLE media_items ADD COLUMN section TEXT',
      'ALTER TABLE media_items ADD COLUMN folder TEXT',
      'ALTER TABLE media_items ADD COLUMN remote_url TEXT',
      'ALTER TABLE media_items ADD COLUMN source_id INTEGER',
      'ALTER TABLE media_items ADD COLUMN source_path TEXT',
      'ALTER TABLE media_items ADD COLUMN source_label TEXT',
      'ALTER TABLE media_items ADD COLUMN relative_path TEXT',
      'ALTER TABLE library_paths ADD COLUMN label TEXT',
      'ALTER TABLE library_paths ADD COLUMN status TEXT NOT NULL DEFAULT "connected"',
      'ALTER TABLE library_paths ADD COLUMN last_scan_at INTEGER',
      'ALTER TABLE library_paths ADD COLUMN last_error TEXT',
      'ALTER TABLE library_paths ADD COLUMN exclude_paths TEXT NOT NULL DEFAULT \'[]\'',
      'ALTER TABLE library_paths ADD COLUMN file_count INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE library_paths ADD COLUMN folder_count INTEGER NOT NULL DEFAULT 0',
    ]) {
      try { _db.exec(ddl); } catch {}
    }
    console.log('[WIVA] sqlite media library ready at', dbPath);
    return _db;
  } catch (e) {
    console.error('[WIVA] sqlite init failed, using JSON fallback for media:', e.message);
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
  if (!_db) return _mediaFallback.library_paths.slice().map(publicLibraryPath);
  return db().prepare('SELECT * FROM library_paths ORDER BY id').all().map(publicLibraryPath);
}
function addPath(p, kind = 'movies', locked = 0, options = {}) {
  const excludePaths = normalizePathList(options.excludePaths ?? options.exclude_paths ?? []);
  if (!_db) {
    if (!_mediaFallback.library_paths.find((r) => r.path === p)) {
      const id = (_mediaFallback.library_paths.reduce((m, r) => Math.max(m, r.id || 0), 0)) + 1;
      _mediaFallback.library_paths.push({
        id,
        path: p,
        kind,
        locked: locked ? 1 : 0,
        added_at: Date.now(),
        label: path.basename(String(p).replace(/[\\/]+$/, '')) || p,
        status: 'connected',
        last_scan_at: null,
        last_error: '',
        exclude_paths: excludePaths,
        file_count: 0,
        folder_count: 0,
      });
      saveMediaFallback();
      bumpMediaRevision();
    }
    return;
  }
  const label = path.basename(String(p).replace(/[\\/]+$/, '')) || p;
  db().prepare('INSERT OR IGNORE INTO library_paths (path, kind, locked, added_at, label, status, exclude_paths) VALUES (?,?,?,?,?,?,?)')
    .run(p, kind, locked ? 1 : 0, Date.now(), label, 'connected', serializePathList(excludePaths));
  bumpMediaRevision();
}
function removePath(id) {
  if (!_db) {
    _mediaFallback.library_paths = _mediaFallback.library_paths.filter((r) => r.id !== id || r.locked);
    saveMediaFallback();
    bumpMediaRevision();
    return;
  }
  db().prepare('DELETE FROM library_paths WHERE id = ? AND locked = 0').run(id);
  bumpMediaRevision();
}
function updatePathStatus(id, patch = {}) {
  const now = Date.now();
  const clean = {
    status: String(patch.status || 'connected'),
    last_scan_at: patch.lastScanAt === undefined ? now : patch.lastScanAt,
    last_error: String(patch.lastError || ''),
    file_count: Math.max(0, Number(patch.fileCount || 0) || 0),
    folder_count: Math.max(0, Number(patch.folderCount || 0) || 0),
    label: patch.label ? String(patch.label) : null,
  };
  if (!_db) {
    _mediaFallback.library_paths = _mediaFallback.library_paths.map((row) => String(row.id) === String(id)
      ? {
        ...row,
        status: clean.status,
        last_scan_at: clean.last_scan_at,
        last_error: clean.last_error,
        file_count: clean.file_count,
        folder_count: clean.folder_count,
        label: clean.label || row.label,
      }
      : row);
    saveMediaFallback();
    bumpMediaRevision();
    return listPaths().find((row) => String(row.id) === String(id)) || null;
  }
  db().prepare(`UPDATE library_paths
    SET status=?, last_scan_at=?, last_error=?, file_count=?, folder_count=?, label=COALESCE(?, label)
    WHERE id=?`).run(clean.status, clean.last_scan_at, clean.last_error, clean.file_count, clean.folder_count, clean.label, id);
  bumpMediaRevision();
  return listPaths().find((row) => String(row.id) === String(id)) || null;
}
function updatePath(id, patch = {}) {
  const current = listPaths().find((row) => String(row.id) === String(id));
  if (!current) return null;
  const clean = {
    kind: patch.kind ? String(patch.kind).trim().slice(0, 40) : current.kind || 'movies',
    label: patch.label !== undefined ? String(patch.label || '').trim().slice(0, 120) : current.label || null,
    exclude_paths: normalizePathList(patch.excludePaths ?? patch.exclude_paths ?? current.exclude_paths),
  };
  if (!_db) {
    _mediaFallback.library_paths = _mediaFallback.library_paths.map((row) => String(row.id) === String(id)
      ? { ...row, kind: clean.kind, label: clean.label || row.label, exclude_paths: clean.exclude_paths }
      : row);
    saveMediaFallback();
    bumpMediaRevision();
    return listPaths().find((row) => String(row.id) === String(id)) || null;
  }
  db().prepare('UPDATE library_paths SET kind=?, label=COALESCE(?, label), exclude_paths=? WHERE id=?')
    .run(clean.kind, clean.label || null, serializePathList(clean.exclude_paths), id);
  bumpMediaRevision();
  return listPaths().find((row) => String(row.id) === String(id)) || null;
}
function setPathExcludes(id, excludePaths = []) {
  return updatePath(id, { excludePaths });
}
function addPathExclude(id, excludePath) {
  const current = listPaths().find((row) => String(row.id) === String(id));
  if (!current) return null;
  return setPathExcludes(id, [...normalizePathList(current.exclude_paths), excludePath]);
}
function removePathExclude(id, excludePath) {
  const target = String(excludePath || '').trim().replace(/[\\/]+$/g, '');
  const current = listPaths().find((row) => String(row.id) === String(id));
  if (!current) return null;
  return setPathExcludes(id, normalizePathList(current.exclude_paths).filter((entry) => entry.replace(/[\\/]+$/g, '') !== target));
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
	        section: item.section ?? existing.section ?? null,
	        folder: item.folder ?? existing.folder ?? null,
	        remote_url: item.remote_url ?? existing.remote_url ?? null,
	        source_id: item.source_id ?? existing.source_id ?? null,
	        source_path: item.source_path ?? existing.source_path ?? null,
	        source_label: item.source_label ?? existing.source_label ?? null,
	        relative_path: item.relative_path ?? existing.relative_path ?? null,
	        scanned_at: now,
      });
      saveMediaFallback();
      bumpMediaRevision();
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
      section: item.section ?? null,
      folder: item.folder ?? null,
      remote_url: item.remote_url ?? null,
      source_id: item.source_id ?? null,
      source_path: item.source_path ?? null,
      source_label: item.source_label ?? null,
      relative_path: item.relative_path ?? null,
      added_at: now,
      scanned_at: now,
    });
    saveMediaFallback();
    bumpMediaRevision();
    return id;
  }
  const now = Date.now();
  const existing = db().prepare('SELECT id, added_at FROM media_items WHERE path = ?').get(item.path);
	  if (existing) {
	    db().prepare(`UPDATE media_items SET kind=?, title=?, year=?, season=?, episode=?, tmdb_id=?,
	      poster_url=?, backdrop_url=?, overview=?, rating=?, duration=?, size=?,
	      section=?, folder=?, remote_url=?, source_id=?, source_path=?, source_label=?, relative_path=?, scanned_at=? WHERE id=?`).run(
	      item.kind, item.title, item.year ?? null, item.season ?? null, item.episode ?? null,
	      item.tmdb_id ?? null, item.poster_url ?? null, item.backdrop_url ?? null,
	      item.overview ?? null, item.rating ?? null, item.duration ?? null, item.size ?? null,
	      item.section ?? null, item.folder ?? null, item.remote_url ?? null,
	      item.source_id ?? null, item.source_path ?? null, item.source_label ?? null, item.relative_path ?? null,
	      now, existing.id);
	    bumpMediaRevision();
	    return existing.id;
	  }
	  const r = db().prepare(`INSERT INTO media_items
	    (path, kind, title, year, season, episode, tmdb_id, poster_url, backdrop_url, overview, rating, duration, size, section, folder, remote_url, source_id, source_path, source_label, relative_path, added_at, scanned_at)
	    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
	    item.path, item.kind, item.title, item.year ?? null, item.season ?? null, item.episode ?? null,
	    item.tmdb_id ?? null, item.poster_url ?? null, item.backdrop_url ?? null,
	    item.overview ?? null, item.rating ?? null, item.duration ?? null, item.size ?? null,
	    item.section ?? null, item.folder ?? null, item.remote_url ?? null,
	    item.source_id ?? null, item.source_path ?? null, item.source_label ?? null, item.relative_path ?? null,
	    now, now);
	  bumpMediaRevision();
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
    bumpMediaRevision();
    return getMedia(id);
  }
  db().prepare(`UPDATE media_items SET kind=?, title=?, year=?, season=?, episode=?,
    poster_url=?, backdrop_url=?, overview=?, rating=?, scanned_at=? WHERE id=?`).run(
    clean.kind, clean.title, clean.year, clean.season, clean.episode,
    clean.poster_url, clean.backdrop_url, clean.overview, clean.rating, Date.now(), id);
  bumpMediaRevision();
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
    bumpMediaRevision();
    return true;
  }
  db().prepare('DELETE FROM subtitles WHERE media_id = ?').run(id);
  db().prepare('DELETE FROM watch_progress WHERE media_id = ?').run(id);
  db().prepare('DELETE FROM media_items WHERE id = ?').run(id);
  bumpMediaRevision();
  return true;
}
function mediaStats() {
  const items = listMedia({ limit: 100000 });
  const logs = listAccessLogs(600).filter((log) => log.targetType === 'media');
  const viewers = listViewers();
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
    uniqueDevices: new Set(logs.map((log) => log.ip).filter(Boolean)).size,
    daily: Object.values(logs.reduce((acc, log) => {
      const day = new Date(log.at || Date.now()).toISOString().slice(0, 10);
      acc[day] = acc[day] || { day, views: 0, bytes: 0, devices: new Set() };
      if (log.action === 'media') acc[day].views += 1;
      acc[day].bytes += Number(log.bytes) || 0;
      if (log.ip) acc[day].devices.add(log.ip);
      return acc;
    }, {})).map((row) => ({ day: row.day, views: row.views, bytes: row.bytes, uniqueDevices: row.devices.size }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    completionRate: (() => {
      const history = viewers.flatMap((viewer) => viewer.history || []);
      const watched = history.filter((row) => Number(row.duration) > 0);
      if (!watched.length) return 0;
      const completed = watched.filter((row) => row.completed || (Number(row.position) / Number(row.duration)) >= 0.85).length;
      return Math.round((completed / watched.length) * 100);
    })(),
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
    bumpMediaRevision();
    return;
  }
  if (!existingPaths.length) return;
  const placeholders = existingPaths.map(() => '?').join(',');
	  db().prepare(`DELETE FROM media_items WHERE path NOT IN (${placeholders})`).run(...existingPaths);
  bumpMediaRevision();
	}
function deleteMissingForSource(sourceId, existingPaths = []) {
  if (!sourceId) return;
  if (!_db) {
    const keep = new Set(existingPaths || []);
    const removedIds = new Set();
    _mediaFallback.media_items = _mediaFallback.media_items.filter((item) => {
      if (String(item.source_id || '') !== String(sourceId)) return true;
      const keepItem = keep.has(item.path);
      if (!keepItem) removedIds.add(String(item.id));
      return keepItem;
    });
    if (removedIds.size) {
      _mediaFallback.subtitles = _mediaFallback.subtitles.filter((sub) => !removedIds.has(String(sub.media_id)));
      for (const key of Object.keys(_mediaFallback.watch_progress)) {
        if (removedIds.has(String(key))) delete _mediaFallback.watch_progress[key];
      }
    }
    saveMediaFallback();
    bumpMediaRevision();
    return;
  }
  if (!existingPaths.length) {
    db().prepare('DELETE FROM subtitles WHERE media_id IN (SELECT id FROM media_items WHERE source_id = ?)').run(sourceId);
    db().prepare('DELETE FROM watch_progress WHERE media_id IN (SELECT id FROM media_items WHERE source_id = ?)').run(sourceId);
    db().prepare('DELETE FROM media_items WHERE source_id = ?').run(sourceId);
    bumpMediaRevision();
    return;
  }
  const placeholders = existingPaths.map(() => '?').join(',');
  const staleIds = db().prepare(`SELECT id FROM media_items WHERE source_id = ? AND path NOT IN (${placeholders})`).all(sourceId, ...existingPaths).map((row) => row.id);
  if (!staleIds.length) return;
  const stalePlaceholders = staleIds.map(() => '?').join(',');
  db().prepare(`DELETE FROM subtitles WHERE media_id IN (${stalePlaceholders})`).run(...staleIds);
  db().prepare(`DELETE FROM watch_progress WHERE media_id IN (${stalePlaceholders})`).run(...staleIds);
  db().prepare(`DELETE FROM media_items WHERE id IN (${stalePlaceholders})`).run(...staleIds);
  bumpMediaRevision();
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
  viewers: {},
  viewerAccounts: {},
  viewerMessages: [],
  blocks: [],
  logs: [],
  blockedMessage: 'البث غير متاح حالياً.',
  mediaTheme: {
    brandName: 'مكتبة WIVA',
    tagline: 'أفلام ومسلسلات وصوتيات جاهزة للمشاهدة داخل الشبكة المحلية',
    logoUrl: '',
    accent: '#3b82f6',
    accent2: '#14b8a6',
    direction: 'rtl',
  },
};

function normalizeAdminState(raw = {}) {
  const mediaTheme = {
    ..._adminState.mediaTheme,
    ...(raw.mediaTheme && typeof raw.mediaTheme === 'object' ? raw.mediaTheme : {}),
  };
  if (mediaTheme.brandName === 'Manara Media' || mediaTheme.brandName === 'مكتبة منارة') mediaTheme.brandName = 'مكتبة WIVA';
  if (mediaTheme.tagline === 'مكتبة وسائط محلية على نفس الشبكة') {
    mediaTheme.tagline = 'أفلام ومسلسلات وصوتيات جاهزة للمشاهدة داخل الشبكة المحلية';
  }
  const blockedMessage = raw.blockedMessage === 'Stream is not available right now.'
    ? 'البث غير متاح حالياً.'
    : String(raw.blockedMessage || 'البث غير متاح حالياً.').slice(0, 300);
  return {
    sessions: raw.sessions && typeof raw.sessions === 'object' ? raw.sessions : {},
    viewers: raw.viewers && typeof raw.viewers === 'object' ? raw.viewers : {},
    viewerAccounts: raw.viewerAccounts && typeof raw.viewerAccounts === 'object' ? raw.viewerAccounts : {},
    viewerMessages: Array.isArray(raw.viewerMessages) ? raw.viewerMessages.slice(-1000) : [],
    blocks: Array.isArray(raw.blocks) ? raw.blocks : [],
    logs: Array.isArray(raw.logs) ? raw.logs.slice(-600) : [],
    blockedMessage,
    mediaTheme,
  };
}

function loadAdminState(baseDir) {
  _adminStatePath = path.join(baseDir, 'manara-admin-state.json');
  try {
    if (fs.existsSync(_adminStatePath)) {
      _adminState = normalizeAdminState(JSON.parse(fs.readFileSync(_adminStatePath, 'utf8')));
    }
  } catch (e) {
    console.error('[WIVA] admin state read failed:', e.message);
  }
}

function saveAdminState() {
  if (!_adminStatePath) return;
  try {
    writeJsonAtomic(_adminStatePath, _adminState);
  } catch (e) {
    console.error('[WIVA] admin state write failed:', e.message);
  }
}

function cleanSessionKey(value) {
  return String(value || '').trim().slice(0, 160) || 'unknown';
}

function randomId(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + crypto.randomBytes(5).toString('hex');
}

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 180);
}

function cleanPhone(value) {
  return String(value || '').trim().replace(/[^\d+]/g, '').slice(0, 40);
}

function cleanDisplayName(value, fallback = '') {
  return String(value || fallback || '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

function publicViewerAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    viewerId: account.viewerId,
    name: account.name || '',
    email: account.email || '',
    phone: account.phone || '',
    disabled: !!account.disabled,
    createdAt: Number(account.createdAt) || 0,
    updatedAt: Number(account.updatedAt) || 0,
    lastSeenAt: Number(account.lastSeenAt) || 0,
  };
}

function makePasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password || ''), salt, 120000, 32, 'sha256').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, account) {
  if (!account?.passwordHash || !account?.passwordSalt) return false;
  const hash = crypto.pbkdf2Sync(String(password || ''), account.passwordSalt, 120000, 32, 'sha256');
  const saved = Buffer.from(String(account.passwordHash), 'hex');
  return saved.length === hash.length && crypto.timingSafeEqual(saved, hash);
}

function findViewerAccountByEmail(email) {
  const clean = cleanEmail(email);
  if (!clean) return null;
  return Object.values(_adminState.viewerAccounts || {}).find((account) => account.email === clean) || null;
}

function findViewerAccountByPhone(phone) {
  const clean = cleanPhone(phone);
  if (!clean) return null;
  return Object.values(_adminState.viewerAccounts || {}).find((account) => account.phone === clean) || null;
}

function mergeUnique(left = [], right = []) {
  return Array.from(new Set([...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])].map(String))).slice(-1000);
}

function mergeViewerState(fromViewerId, toViewerId) {
  const fromId = cleanSessionKey(fromViewerId);
  const toId = cleanSessionKey(toViewerId);
  if (!fromId || !toId || fromId === toId) return viewerState(toId);
  const from = viewerState(fromId);
  const to = viewerState(toId);
  to.favorites = mergeUnique(to.favorites, from.favorites);
  to.watchLater = mergeUnique(to.watchLater, from.watchLater);
  const rows = [...(Array.isArray(to.history) ? to.history : []), ...(Array.isArray(from.history) ? from.history : [])]
    .reduce((acc, row) => {
      const key = String(row.mediaId || '');
      if (!key) return acc;
      const current = acc.get(key);
      if (!current || Number(row.updatedAt || 0) > Number(current.updatedAt || 0)) acc.set(key, { ...row, mediaId: key });
      return acc;
    }, new Map());
  to.history = Array.from(rows.values()).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, 500);
  to.updatedAt = Date.now();
  saveAdminState();
  return to;
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

function viewerState(viewerId) {
  const id = cleanSessionKey(viewerId);
  if (!_adminState.viewers[id]) {
    _adminState.viewers[id] = {
      id,
      favorites: [],
      watchLater: [],
      history: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    saveAdminState();
  }
  return _adminState.viewers[id];
}

function updateViewerList(viewerId, listName, mediaId, active) {
  const state = viewerState(viewerId);
  const key = String(mediaId);
  const list = Array.isArray(state[listName]) ? state[listName] : [];
  const idx = list.indexOf(key);
  if (active && idx < 0) list.push(key);
  if (!active && idx >= 0) list.splice(idx, 1);
  state[listName] = list.slice(-1000);
  state.updatedAt = Date.now();
  saveAdminState();
  return state;
}

function recordViewerHistory(viewerId, mediaId, patch = {}) {
  const state = viewerState(viewerId);
  const key = String(mediaId);
  const rest = (state.history || []).filter((row) => String(row.mediaId) !== key);
  const position = Math.max(0, Number(patch.position) || 0);
  const duration = Math.max(0, Number(patch.duration) || 0);
  rest.unshift({
    mediaId: key,
    position,
    duration,
    completed: !!patch.completed || (duration > 0 && position / duration >= 0.85),
    updatedAt: Date.now(),
  });
  state.history = rest.slice(0, 500);
  state.updatedAt = Date.now();
  saveAdminState();
  return state;
}

function listViewers() {
  return Object.values(_adminState.viewers)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, 500);
}

function createViewerAccount({ name, email, password, fromViewerId } = {}) {
  const clean = cleanEmail(email);
  const displayName = cleanDisplayName(name, clean.split('@')[0]);
  if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('email_required');
  if (String(password || '').length < 4) throw new Error('password_too_short');
  if (findViewerAccountByEmail(clean)) throw new Error('account_exists');
  const id = randomId('user');
  const viewerId = `account_${id}`;
  const passwordRecord = makePasswordRecord(password);
  const now = Date.now();
  const account = {
    id,
    viewerId,
    name: displayName,
    email: clean,
    passwordSalt: passwordRecord.salt,
    passwordHash: passwordRecord.hash,
    sessions: {},
    disabled: false,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  };
  _adminState.viewerAccounts[id] = account;
  viewerState(viewerId);
  if (fromViewerId) mergeViewerState(fromViewerId, viewerId);
  saveAdminState();
  return publicViewerAccount(account);
}

function createOrUpdateViewerProfile({ name, phone, email, fromViewerId } = {}) {
  const clean = cleanPhone(phone);
  if (!clean) throw new Error('phone_required');
  const displayName = cleanDisplayName(name, clean);
  if (!displayName) throw new Error('name_required');
  const cleanMail = cleanEmail(email);
  const now = Date.now();
  let account = findViewerAccountByPhone(clean);
  if (!account) {
    const id = randomId('user');
    account = {
      id,
      viewerId: `account_${id}`,
      name: displayName,
      phone: clean,
      email: cleanMail,
      passwordSalt: '',
      passwordHash: '',
      sessions: {},
      disabled: false,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    };
    _adminState.viewerAccounts[id] = account;
    viewerState(account.viewerId);
  } else {
    if (account.disabled) throw new Error('account_disabled');
    account.name = displayName;
    account.phone = clean;
    account.email = cleanMail || account.email || '';
    account.updatedAt = now;
    account.lastSeenAt = now;
  }
  if (fromViewerId) mergeViewerState(fromViewerId, account.viewerId);
  saveAdminState();
  return startViewerAccountSession(account.id);
}

function createViewerProfile({ name, phone, email, fromViewerId } = {}) {
  const clean = cleanPhone(phone);
  if (!clean) throw new Error('phone_required');
  const displayName = cleanDisplayName(name, '');
  if (!displayName) throw new Error('name_required');
  if (findViewerAccountByPhone(clean)) throw new Error('account_exists');
  return createOrUpdateViewerProfile({ name: displayName, phone: clean, email, fromViewerId });
}

function startViewerAccountSession(accountId) {
  const account = _adminState.viewerAccounts[String(accountId)];
  if (!account || account.disabled) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  account.sessions = account.sessions && typeof account.sessions === 'object' ? account.sessions : {};
  account.sessions[token] = { createdAt: now, lastSeenAt: now };
  const entries = Object.entries(account.sessions).sort((a, b) => Number(b[1].lastSeenAt || 0) - Number(a[1].lastSeenAt || 0)).slice(0, 8);
  account.sessions = Object.fromEntries(entries);
  account.lastSeenAt = now;
  account.updatedAt = now;
  saveAdminState();
  return { token, account: publicViewerAccount(account) };
}

function authenticateViewerAccount({ email, password, fromViewerId } = {}) {
  const account = findViewerAccountByEmail(email);
  if (!account || account.disabled || !verifyPassword(password, account)) throw new Error('invalid_credentials');
  if (fromViewerId) mergeViewerState(fromViewerId, account.viewerId);
  return startViewerAccountSession(account.id);
}

function authenticateViewerProfile({ name, phone, email, fromViewerId } = {}) {
  const clean = cleanPhone(phone);
  if (!clean) throw new Error('phone_required');
  const displayName = cleanDisplayName(name, '');
  if (!displayName) throw new Error('name_required');
  const account = findViewerAccountByPhone(clean);
  if (!account || account.disabled) throw new Error(account?.disabled ? 'account_disabled' : 'invalid_credentials');
  const normalizedStoredName = cleanDisplayName(account.name, '').toLocaleLowerCase('ar');
  const normalizedProvidedName = displayName.toLocaleLowerCase('ar');
  if (!normalizedStoredName || normalizedStoredName !== normalizedProvidedName) throw new Error('invalid_credentials');
  if (email) account.email = cleanEmail(email) || account.email || '';
  account.lastSeenAt = Date.now();
  account.updatedAt = Date.now();
  if (fromViewerId) mergeViewerState(fromViewerId, account.viewerId);
  saveAdminState();
  return startViewerAccountSession(account.id);
}

function viewerAccountBySession(token) {
  const clean = String(token || '').trim();
  if (!clean) return null;
  for (const account of Object.values(_adminState.viewerAccounts || {})) {
    if (account.disabled || !account.sessions?.[clean]) continue;
    account.sessions[clean].lastSeenAt = Date.now();
    account.lastSeenAt = Date.now();
    return publicViewerAccount(account);
  }
  return null;
}

function clearViewerAccountSession(token) {
  const clean = String(token || '').trim();
  if (!clean) return false;
  let changed = false;
  for (const account of Object.values(_adminState.viewerAccounts || {})) {
    if (account.sessions?.[clean]) {
      delete account.sessions[clean];
      account.updatedAt = Date.now();
      changed = true;
    }
  }
  if (changed) saveAdminState();
  return changed;
}

function listViewerAccounts() {
  return Object.values(_adminState.viewerAccounts || {})
    .map(publicViewerAccount)
    .sort((a, b) => Number(b.lastSeenAt || b.updatedAt || 0) - Number(a.lastSeenAt || a.updatedAt || 0))
    .slice(0, 1000);
}

function addViewerMessage(viewerId, patch = {}) {
  const state = viewerState(viewerId);
  const row = {
    id: randomId('msg'),
    viewerId: state.id,
    name: cleanDisplayName(patch.name, ''),
    phone: cleanPhone(patch.phone),
    email: cleanEmail(patch.email),
    message: String(patch.message || '').trim().slice(0, 1200),
    context: String(patch.context || '').slice(0, 220),
    status: 'new',
    createdAt: Date.now(),
  };
  if (!row.message) throw new Error('message_required');
  _adminState.viewerMessages.unshift(row);
  _adminState.viewerMessages = _adminState.viewerMessages.slice(0, 1000);
  saveAdminState();
  return row;
}

function listViewerMessages(limit = 200) {
  return (_adminState.viewerMessages || []).slice(0, Math.max(1, Number(limit) || 200));
}

function listViewerMessagesForViewer(viewerId, limit = 100) {
  const clean = cleanSessionKey(viewerId);
  return (_adminState.viewerMessages || [])
    .filter((row) => row.viewerId === clean)
    .slice(0, Math.max(1, Math.min(200, Number(limit) || 100)))
    .map((row) => ({
      id: row.id,
      message: row.message,
      context: row.context || '',
      status: row.status || 'new',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt || null,
    }));
}

function updateViewerMessageStatus(id, status = 'read') {
  const cleanStatus = ['new', 'read', 'done'].includes(status) ? status : 'read';
  const row = (_adminState.viewerMessages || []).find((msg) => String(msg.id) === String(id));
  if (!row) return null;
  row.status = cleanStatus;
  row.updatedAt = Date.now();
  saveAdminState();
  return row;
}

function mediaTheme() {
  return { ..._adminState.mediaTheme };
}

function setMediaTheme(patch = {}) {
  _adminState.mediaTheme = {
    ..._adminState.mediaTheme,
    brandName: String(patch.brandName ?? _adminState.mediaTheme.brandName).slice(0, 80),
    tagline: String(patch.tagline ?? _adminState.mediaTheme.tagline).slice(0, 180),
    logoUrl: String(patch.logoUrl ?? _adminState.mediaTheme.logoUrl).slice(0, 500),
    accent: /^#[0-9a-fA-F]{6}$/.test(String(patch.accent || '')) ? patch.accent : _adminState.mediaTheme.accent,
    accent2: /^#[0-9a-fA-F]{6}$/.test(String(patch.accent2 || '')) ? patch.accent2 : _adminState.mediaTheme.accent2,
    direction: patch.direction === 'ltr' ? 'ltr' : 'rtl',
  };
  saveAdminState();
  return mediaTheme();
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
  return _adminState.blockedMessage || 'البث غير متاح حالياً.';
}

function setBlockedMessage(message) {
  _adminState.blockedMessage = String(message || 'البث غير متاح حالياً.').slice(0, 300);
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

function cleanHeaders(value) {
  let raw = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); }
    catch { raw = {}; }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const blocked = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'range']);
  const out = {};
  for (const [key, val] of Object.entries(raw)) {
    const name = String(key || '').trim();
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) continue;
    if (blocked.has(name.toLowerCase())) continue;
    const text = String(val ?? '').replace(/[\r\n]/g, ' ').trim();
    if (!text) continue;
    out[name] = text.slice(0, 500);
  }
  return out;
}

function addIptv({ name, url, logo, category, enabled, transferLimitBytes, headers }) {
  const nextId = _channels.iptv.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
  const row = {
    id: nextId,
    name,
    url,
    logo: logo || null,
    category: category || null,
    headers: cleanHeaders(headers),
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
      headers: cleanHeaders(next.headers),
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

function cleanAudioMode(value) {
  const next = String(value || 'direct').trim();
  return ['direct', 'voice', 'cinema'].includes(next) ? next : 'direct';
}

function cleanNumber(value, fallback, min, max) {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return fallback;
  return Math.max(min, Math.min(max, next));
}

function upsertBroadcastChannel(channel) {
  const existing = _channels.broadcast.find((r) => r.id === channel.id);
  const clean = {
    id: channel.id,
    name: channel.name,
    description: channel.description || '',
    source: channel.source || {},
    audioDeviceId: channel.audioDeviceId || 'none',
    audioDeviceName: channel.audioDeviceName || '',
    audioDeviceMatchName: channel.audioDeviceMatchName || channel.audioDeviceName || '',
    resolution: channel.resolution || '1920x1080',
    fps: channel.fps || 30,
    bitrateKbps: channel.bitrateKbps || 8000,
    audioBitrateKbps: cleanNumber(channel.audioBitrateKbps, 256, 64, 320),
    audioMode: cleanAudioMode(channel.audioMode),
    audioGain: cleanNumber(channel.audioGain, 1, 0.5, 2),
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
    audioDeviceName: c.audioDeviceName || '',
    audioDeviceMatchName: c.audioDeviceMatchName || c.audioDeviceName || '',
    resolution: c.resolution || '1920x1080',
    fps: c.fps || 30,
    bitrateKbps: c.bitrateKbps || 8000,
    audioBitrateKbps: cleanNumber(c.audioBitrateKbps, 256, 64, 320),
    audioMode: cleanAudioMode(c.audioMode),
    audioGain: cleanNumber(c.audioGain, 1, 0.5, 2),
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
      audioDeviceName: c.audioDeviceName || '',
      audioDeviceMatchName: c.audioDeviceMatchName || c.audioDeviceName || '',
      resolution: c.resolution || '1920x1080',
      fps: c.fps || 30,
      bitrateKbps: c.bitrateKbps || 8000,
      audioBitrateKbps: cleanNumber(c.audioBitrateKbps, 256, 64, 320),
      audioMode: cleanAudioMode(c.audioMode),
      audioGain: cleanNumber(c.audioGain, 1, 0.5, 2),
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
      headers: cleanHeaders(c.headers),
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
  mediaRevision,
  listPaths, addPath, removePath, updatePathStatus, updatePath, setPathExcludes, addPathExclude, removePathExclude,
  upsertMedia, listMedia, getMedia, updateMedia, removeMedia, mediaStats, deleteMissing, deleteMissingForSource,
  setProgress, addSubtitle, listSubtitles, getSubtitle,
  listIptv, getIptv, addIptv, updateIptv, removeIptv,
  listBroadcastChannels, upsertBroadcastChannel, setBroadcastChannels, removeBroadcastChannel,
  touchSession, addSessionBytes, addAccessLog, listSessions, listAccessLogs,
  viewerState, updateViewerList, recordViewerHistory, listViewers,
  createViewerAccount, authenticateViewerAccount, viewerAccountBySession, clearViewerAccountSession,
  createViewerProfile, createOrUpdateViewerProfile, authenticateViewerProfile,
  listViewerAccounts, addViewerMessage, listViewerMessages, listViewerMessagesForViewer, updateViewerMessageStatus,
  mediaTheme, setMediaTheme,
  listBlocks, addBlock, removeBlock, isBlocked, blockedMessage, setBlockedMessage,
  replaceAllChannels, exportChannels,
};
