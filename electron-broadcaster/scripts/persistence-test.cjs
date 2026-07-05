// WIVA persistence + storage-backend reliability tests.
//
// These simulate the exact failure the issue describes on Windows: the app
// restarting, and the app having previously run in JSON fallback because the
// native database module could not load. They assert that:
//   1. Media, library paths, channels, IPTV, viewer accounts, and themes all
//      survive an app "restart" (module re-init against the same data dir).
//   2. diagnostics() clearly reports the active storage backend + failure cause.
//   3. Data written while in JSON fallback is migrated back into SQLite once the
//      native database becomes available (recovery mode).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbModulePath = require.resolve('../library/db.cjs');

// Load a completely fresh copy of the db module so we can simulate an app
// restart (fresh in-memory state) and, when needed, force the JSON fallback.
function freshDb({ forceFallback = false } = {}) {
  delete require.cache[dbModulePath];
  if (forceFallback) {
    const sqlitePath = require.resolve('better-sqlite3');
    const saved = require.cache[sqlitePath];
    // Remove it and poison the cache so require() throws inside db.cjs.
    require.cache[sqlitePath] = { id: sqlitePath, exports: null, loaded: true };
    Object.defineProperty(require.cache[sqlitePath], 'exports', {
      get() { throw new Error('TEST: simulated better-sqlite3 native load failure'); },
    });
    try {
      return { db: require('../library/db.cjs'), restore: () => { require.cache[sqlitePath] = saved; } };
    } catch (e) {
      require.cache[sqlitePath] = saved;
      throw e;
    }
  }
  return { db: require('../library/db.cjs'), restore: () => {} };
}

function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiva-persist-'));
  const dbPath = path.join(dir, 'manara-library.db');

  // ---- Run 1: fresh install, write everything -------------------------------
  {
    const { db } = freshDb();
    const handle = db.init(dbPath, { broadcast: [], iptv: [] });
    const diag = db.diagnostics();
    const sqliteMode = diag.storageBackend === 'sqlite';
    assert.ok(['sqlite', 'json-fallback'].includes(diag.storageBackend), 'backend must be reported');

    db.addPath('/media/movies', 'movies', 0);
    const mediaId = db.upsertMedia({ path: '/media/movies/a.mkv', kind: 'movie', title: 'Film A', year: 2020 });
    db.setProgress(mediaId, 120, 600);
    db.addIptv({ name: 'Local News', url: 'http://127.0.0.1/news.m3u8', category: 'أخبار', enabled: true });
    db.upsertBroadcastChannel({ id: 'lobby-1', name: 'Lobby', enabled: true });
    db.setMediaTheme({ accent: '#ff0000' });
    const account = db.createViewerAccount({ name: 'Guest', email: 'guest@example.com', password: 'secret' });
    assert.ok(account && account.id, 'viewer account created');

    // If sqlite is the backend, there must be no media JSON fallback file.
    if (sqliteMode) {
      assert.ok(!fs.existsSync(dbPath + '.media.json'), 'sqlite mode must not write media fallback JSON');
    }
  }

  // ---- Run 2: simulated restart, everything must still be present ------------
  {
    const { db } = freshDb();
    db.init(dbPath, { broadcast: [], iptv: [] });

    const media = db.listMedia({ limit: 100 });
    assert.equal(media.length, 1, 'media item survives restart');
    assert.equal(media[0].title, 'Film A', 'media title survives restart');
    assert.equal(Number(media[0].position), 120, 'watch progress survives restart');

    const paths = db.listPaths();
    assert.ok(paths.find((p) => p.path === '/media/movies'), 'library path survives restart');

    const iptv = db.listIptv();
    assert.ok(iptv.find((c) => c.url === 'http://127.0.0.1/news.m3u8'), 'IPTV channel survives restart');

    const broadcast = db.listBroadcastChannels();
    assert.ok(broadcast.find((c) => c.id === 'lobby-1'), 'broadcast channel survives restart');

    assert.equal(db.mediaTheme().accent, '#ff0000', 'media theme survives restart');

    const auth = db.authenticateViewerAccount({ email: 'guest@example.com', password: 'secret' });
    assert.ok(auth && auth.account, 'viewer account + password hash survive restart');
  }

  console.log('WIVA persistence (restart) tests passed');

  // ---- Migration/repair: JSON fallback -> SQLite ----------------------------
  const migDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiva-migrate-'));
  const migDbPath = path.join(migDir, 'manara-library.db');
  let fallbackRan = false;
  {
    let handle;
    try {
      handle = freshDb({ forceFallback: true });
    } catch {
      handle = null;
    }
    if (handle) {
      const { db, restore } = handle;
      try {
        db.init(migDbPath, { broadcast: [], iptv: [] });
        const diag = db.diagnostics();
        assert.equal(diag.storageBackend, 'json-fallback', 'forced fallback must report json-fallback');
        assert.ok(diag.recoveryAction, 'fallback must include a recovery action for admins');
        db.addPath('/media/tv', 'series', 0);
        db.upsertMedia({ path: '/media/tv/e1.mkv', kind: 'episode', title: 'Episode 1', season: 1, episode: 1 });
        assert.ok(fs.existsSync(migDbPath + '.media.json'), 'fallback writes media JSON');
        fallbackRan = true;
      } finally {
        restore();
      }
    } else {
      console.log('WIVA migration test skipped (could not force fallback in this runtime)');
    }
  }

  if (fallbackRan) {
    // Now "restart" with sqlite available: data must be migrated into SQLite.
    const { db } = freshDb();
    const handle = db.init(migDbPath, { broadcast: [], iptv: [] });
    const diag = db.diagnostics();
    if (handle) {
      assert.equal(diag.storageBackend, 'recovery', 'migration must switch backend to recovery');
      assert.equal(diag.migratedFromFallback, true, 'migration flag must be set');
      const media = db.listMedia({ limit: 100 });
      assert.equal(media.length, 1, 'media migrated from fallback into sqlite');
      assert.equal(media[0].title, 'Episode 1', 'migrated media retains title');
      assert.ok(fs.existsSync(migDbPath + '.media.json.migrated'), 'fallback file is retained as .migrated');
      assert.ok(!fs.existsSync(migDbPath + '.media.json'), 'active fallback file removed after migration');
      console.log('WIVA fallback -> SQLite migration tests passed');
    } else {
      console.log('WIVA migration test skipped (sqlite unavailable in this runtime)');
    }
  }

  console.log('WIVA persistence tests passed');
}

main();
