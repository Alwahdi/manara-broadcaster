// WIVA native database load validation.
//
// The Windows persistence issue was caused by the packaged app silently falling
// back to JSON when the better-sqlite3 native module failed to load. This script
// fails loudly (non-zero exit) if the native module cannot be required or cannot
// open a database, so CI (and a packaged smoke run) catches a broken native
// build before it ships to customers.
//
// It also validates that package.json keeps better-sqlite3 in asarUnpack, since
// native .node files cannot be loaded from inside an asar archive.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function checkPackaging() {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const unpack = (pkg.build && pkg.build.asarUnpack) || [];
  const ok = unpack.some((p) => String(p).includes('better-sqlite3'));
  assert.ok(ok, 'package.json build.asarUnpack must include better-sqlite3 so the native .node file is loadable outside the asar archive');
  console.log('WIVA native-db: asarUnpack includes better-sqlite3 ✓');
}

function checkNativeLoad() {
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    console.error('WIVA native-db: better-sqlite3 FAILED to load:', (e && e.message) || e);
    console.error('Recovery: run "npm run dev:repair-native" (electron-builder install-app-deps) to rebuild the native module for this Electron/ABI, and ensure antivirus is not quarantining the .node file.');
    process.exit(1);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiva-nativedb-'));
  const dbPath = path.join(dir, 'probe.db');
  const db = new Database(dbPath);
  try {
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    db.prepare('INSERT INTO t (v) VALUES (?)').run('ok');
    const row = db.prepare('SELECT v FROM t WHERE id = 1').get();
    assert.equal(row.v, 'ok', 'native sqlite round-trip must succeed');
  } finally {
    db.close();
  }
  console.log('WIVA native-db: better-sqlite3 loaded and completed a read/write round-trip ✓');
}

checkPackaging();
checkNativeLoad();
console.log('WIVA native database validation passed');
