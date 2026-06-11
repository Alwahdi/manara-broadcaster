// Manara — local media library DB (better-sqlite3)
const path = require('path');
const fs = require('fs');

let Database;
try { Database = require('better-sqlite3'); } catch (e) { Database = null; }

let _db = null;
let _fallbackPath = null;
let _fallback = { broadcast_channels: [], iptv_channels: [] };

function loadFallback(dbPath) {
  _fallbackPath = dbPath + '.json';
  try {
    if (fs.existsSync(_fallbackPath)) _fallback = { ..._fallback, ...JSON.parse(fs.readFileSync(_fallbackPath, 'utf8')) };
  } catch (e) { console.error('[Manara] fallback DB read failed:', e.message); }
}
function saveFallback() {
  if (!_fallbackPath) return;
  try {
    fs.mkdirSync(path.dirname(_fallbackPath), { recursive: true });
    const tmp = _fallbackPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(_fallback, null, 2));
    fs.renameSync(tmp, _fallbackPath);
  } catch (e) { console.error('[Manara] fallback DB write failed:', e.message); }
}

function init(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (!Database) {
    loadFallback(dbPath);
    console.warn('[Manara] better-sqlite3 not available; using JSON fallback DB');
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
    CREATE TABLE IF NOT EXISTS iptv_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      logo TEXT,
      category TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      added_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS broadcast_channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      source_json TEXT NOT NULL,
      audio_device_id TEXT,
      resolution TEXT,
      fps INTEGER,
      bitrate_kbps INTEGER,
      auto_start INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      added_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    `);
    return _db;
  } catch (e) {
    console.error('[Manara] SQLite DB init failed; using JSON fallback DB:', e.message);
    _db = null;
    loadFallback(dbPath);
    return null;
  }
}

function db() {
  if (!_db) throw new Error('Library DB not initialized');
  return _db;
}

// ---- library paths
function listPaths() {
  return db().prepare('SELECT * FROM library_paths ORDER BY id').all();
}
function addPath(p, kind = 'movies', locked = 0) {
  const stmt = db().prepare(
    'INSERT OR IGNORE INTO library_paths (path, kind, locked, added_at) VALUES (?,?,?,?)'
  );
  return stmt.run(p, kind, locked ? 1 : 0, Date.now());
}
function removePath(id) {
  return db().prepare('DELETE FROM library_paths WHERE id = ? AND locked = 0').run(id);
}

// ---- media
function upsertMedia(item) {
  const now = Date.now();
  const existing = db().prepare('SELECT id, added_at FROM media_items WHERE path = ?').get(item.path);
  if (existing) {
    db().prepare(`UPDATE media_items SET
      kind=?, title=?, year=?, season=?, episode=?, tmdb_id=?,
      poster_url=?, backdrop_url=?, overview=?, rating=?, duration=?, size=?, scanned_at=?
      WHERE id=?`).run(
      item.kind, item.title, item.year ?? null, item.season ?? null, item.episode ?? null,
      item.tmdb_id ?? null, item.poster_url ?? null, item.backdrop_url ?? null,
      item.overview ?? null, item.rating ?? null, item.duration ?? null, item.size ?? null,
      now, existing.id
    );
    return existing.id;
  }
  const r = db().prepare(`INSERT INTO media_items
    (path, kind, title, year, season, episode, tmdb_id, poster_url, backdrop_url, overview, rating, duration, size, added_at, scanned_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    item.path, item.kind, item.title, item.year ?? null, item.season ?? null, item.episode ?? null,
    item.tmdb_id ?? null, item.poster_url ?? null, item.backdrop_url ?? null,
    item.overview ?? null, item.rating ?? null, item.duration ?? null, item.size ?? null,
    now, now
  );
  return r.lastInsertRowid;
}
function listMedia({ kind, q, limit = 200 } = {}) {
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
  return db().prepare('SELECT * FROM media_items WHERE id = ?').get(id);
}
function deleteMissing(existingPaths) {
  if (!existingPaths.length) return;
  const placeholders = existingPaths.map(() => '?').join(',');
  db().prepare(`DELETE FROM media_items WHERE path NOT IN (${placeholders})`).run(...existingPaths);
}

// ---- progress
function setProgress(mediaId, position, duration) {
  db().prepare(`INSERT INTO watch_progress (media_id, position, duration, updated_at)
                VALUES (?,?,?,?)
                ON CONFLICT(media_id) DO UPDATE SET position=excluded.position,
                duration=excluded.duration, updated_at=excluded.updated_at`)
    .run(mediaId, position, duration, Date.now());
}

// ---- subtitles
function addSubtitle(mediaId, lang, p, label) {
  db().prepare('INSERT INTO subtitles (media_id, lang, path, label) VALUES (?,?,?,?)')
    .run(mediaId, lang, p, label || null);
}
function listSubtitles(mediaId) {
  return db().prepare('SELECT * FROM subtitles WHERE media_id = ?').all(mediaId);
}
function getSubtitle(id) {
  return db().prepare('SELECT * FROM subtitles WHERE id = ?').get(id);
}

// ---- iptv channels
function listIptv() {
  if (!_db) return (_fallback.iptv_channels || []).slice().sort((a, b) => Number(b.id) - Number(a.id));
  return db().prepare('SELECT * FROM iptv_channels ORDER BY id DESC').all();
}
function getIptv(id) {
  if (!_db) return (_fallback.iptv_channels || []).find((r) => String(r.id) === String(id)) || null;
  return db().prepare('SELECT * FROM iptv_channels WHERE id = ?').get(id);
}
function addIptv({ name, url, logo, category }) {
  if (!_db) {
    const rows = _fallback.iptv_channels || [];
    const nextId = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
    const row = { id: nextId, name, url, logo: logo || null, category: category || null, enabled: 1, added_at: Date.now() };
    _fallback.iptv_channels = [row, ...rows];
    saveFallback();
    return nextId;
  }
  const r = db().prepare(
    'INSERT INTO iptv_channels (name, url, logo, category, enabled, added_at) VALUES (?,?,?,?,1,?)'
  ).run(name, url, logo || null, category || null, Date.now());
  return r.lastInsertRowid;
}
function updateIptv(id, patch) {
  const cur = getIptv(id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  if (!_db) {
    _fallback.iptv_channels = (_fallback.iptv_channels || []).map((r) => String(r.id) === String(id)
      ? { ...r, name: next.name, url: next.url, logo: next.logo || null, category: next.category || null, enabled: next.enabled ? 1 : 0 }
      : r);
    saveFallback();
    return getIptv(id);
  }
  db().prepare('UPDATE iptv_channels SET name=?, url=?, logo=?, category=?, enabled=? WHERE id=?')
    .run(next.name, next.url, next.logo || null, next.category || null, next.enabled ? 1 : 0, id);
  return getIptv(id);
}
function removeIptv(id) {
  if (!_db) {
    _fallback.iptv_channels = (_fallback.iptv_channels || []).filter((r) => String(r.id) !== String(id));
    saveFallback();
    return;
  }
  db().prepare('DELETE FROM iptv_channels WHERE id = ?').run(id);
}

// ---- broadcast/capture channels (camera, screen, URL)
function rowToBroadcastChannel(row) {
  if (!row) return null;
  let source = {};
  try { source = JSON.parse(row.source_json || '{}'); } catch {}
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    source,
    audioDeviceId: row.audio_device_id || 'none',
    resolution: row.resolution || '1280x720',
    fps: row.fps || 30,
    bitrateKbps: row.bitrate_kbps || 2500,
    autoStart: !!row.auto_start,
    enabled: row.enabled !== 0,
  };
}
function listBroadcastChannels() {
  if (!_db) return (_fallback.broadcast_channels || []).map(rowToBroadcastChannel);
  return db().prepare('SELECT * FROM broadcast_channels ORDER BY added_at ASC').all().map(rowToBroadcastChannel);
}
function upsertBroadcastChannel(channel) {
  const now = Date.now();
  if (!_db) {
    const rows = _fallback.broadcast_channels || [];
    const existing = rows.find((r) => r.id === channel.id);
    const row = {
      id: channel.id,
      name: channel.name,
      description: channel.description || '',
      source_json: JSON.stringify(channel.source || {}),
      audio_device_id: channel.audioDeviceId || 'none',
      resolution: channel.resolution || '1280x720',
      fps: channel.fps || 30,
      bitrate_kbps: channel.bitrateKbps || 2500,
      auto_start: channel.autoStart ? 1 : 0,
      enabled: channel.enabled === false ? 0 : 1,
      added_at: existing?.added_at || now,
      updated_at: now,
    };
    _fallback.broadcast_channels = existing ? rows.map((r) => r.id === channel.id ? row : r) : [...rows, row];
    saveFallback();
    return rowToBroadcastChannel(row);
  }
  const existing = db().prepare('SELECT added_at FROM broadcast_channels WHERE id = ?').get(channel.id);
  db().prepare(`INSERT INTO broadcast_channels
    (id, name, description, source_json, audio_device_id, resolution, fps, bitrate_kbps, auto_start, enabled, added_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,
      description=excluded.description,
      source_json=excluded.source_json,
      audio_device_id=excluded.audio_device_id,
      resolution=excluded.resolution,
      fps=excluded.fps,
      bitrate_kbps=excluded.bitrate_kbps,
      auto_start=excluded.auto_start,
      enabled=excluded.enabled,
      updated_at=excluded.updated_at`).run(
    channel.id,
    channel.name,
    channel.description || '',
    JSON.stringify(channel.source || {}),
    channel.audioDeviceId || 'none',
    channel.resolution || '1280x720',
    channel.fps || 30,
    channel.bitrateKbps || 2500,
    channel.autoStart ? 1 : 0,
    channel.enabled === false ? 0 : 1,
    existing?.added_at || now,
    now
  );
  return rowToBroadcastChannel(db().prepare('SELECT * FROM broadcast_channels WHERE id = ?').get(channel.id));
}
function setBroadcastChannels(channels) {
  if (!_db) {
    const now = Date.now();
    _fallback.broadcast_channels = (Array.isArray(channels) ? channels : []).map((channel) => ({
      id: channel.id,
      name: channel.name,
      description: channel.description || '',
      source_json: JSON.stringify(channel.source || {}),
      audio_device_id: channel.audioDeviceId || 'none',
      resolution: channel.resolution || '1280x720',
      fps: channel.fps || 30,
      bitrate_kbps: channel.bitrateKbps || 2500,
      auto_start: channel.autoStart ? 1 : 0,
      enabled: channel.enabled === false ? 0 : 1,
      added_at: now,
      updated_at: now,
    }));
    saveFallback();
    return listBroadcastChannels();
  }
  const tx = db().transaction((items) => {
    const ids = new Set(items.map((c) => c.id));
    for (const c of items) upsertBroadcastChannel(c);
    for (const row of db().prepare('SELECT id FROM broadcast_channels').all()) {
      if (!ids.has(row.id)) db().prepare('DELETE FROM broadcast_channels WHERE id = ?').run(row.id);
    }
  });
  tx(Array.isArray(channels) ? channels : []);
  return listBroadcastChannels();
}
function removeBroadcastChannel(id) {
  if (!_db) {
    _fallback.broadcast_channels = (_fallback.broadcast_channels || []).filter((r) => r.id !== id);
    saveFallback();
    return;
  }
  db().prepare('DELETE FROM broadcast_channels WHERE id = ?').run(id);
}

module.exports = {
  init, listPaths, addPath, removePath,
  upsertMedia, listMedia, getMedia, deleteMissing,
  setProgress, addSubtitle, listSubtitles, getSubtitle,
  listIptv, getIptv, addIptv, updateIptv, removeIptv,
  listBroadcastChannels, upsertBroadcastChannel, setBroadcastChannels, removeBroadcastChannel,
};
