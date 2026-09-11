const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const db = require('../library/db.cjs');
const scanner = require('../library/scanner.cjs');
const { LibraryScanManager } = require('../library/scan-manager.cjs');

function waitForScan(manager, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const status = manager.status();
      if (!status.active && ['complete', 'error', 'cancelled'].includes(status.state)) {
        clearInterval(timer);
        if (status.state === 'complete') resolve(status);
        else reject(new Error(status.error || `Scan ended as ${status.state}`));
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('Background library scan timed out'));
      }
    }, 25);
  });
}

async function requestHeartbeat(port) {
  return new Promise((resolve, reject) => {
    const request = http.get(`http://127.0.0.1:${port}/health`, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.setTimeout(1000, () => request.destroy(new Error('heartbeat timeout')));
    request.on('error', reject);
  });
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wiva-scan-'));
  const source = path.join(root, 'library');
  const dbPath = path.join(root, 'library.db');
  fs.mkdirSync(source, { recursive: true });
  for (let index = 0; index < 1050; index += 1) {
    fs.writeFileSync(path.join(source, `document-${index}.txt`), `WIVA document ${index}`);
  }
  for (let index = 0; index < 50; index += 1) {
    fs.writeFileSync(path.join(source, `book-${index}.pdf`), '%PDF-1.4\n% WIVA test\n');
  }

  db.init(dbPath, {});
  db.addPath(source, 'mixed', 0);
  const manager = new LibraryScanManager({
    dbPath,
    getScanOptions: () => ({ tmdbKey: '', thumbnailDir: path.join(root, 'thumbs') }),
    onComplete: () => db.notifyExternalChange(),
  });

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  let lastTick = Date.now();
  let maxDelay = 0;
  const eventLoopProbe = setInterval(() => {
    const now = Date.now();
    maxDelay = Math.max(maxDelay, now - lastTick - 20);
    lastTick = now;
  }, 20);

  try {
    manager.start({ reason: 'test-first-scan' });
    const heartbeats = [];
    while (manager.status().active) {
      heartbeats.push(await requestHeartbeat(port));
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const first = await waitForScan(manager);
    assert.strictEqual(first.result.addedOrUpdated, 1100, 'first scan should index every supported item');
    assert.strictEqual(db.listMedia({ limit: 1200 }).length, 1100, 'parent process should observe worker index');
    assert.ok(heartbeats.length > 0 && heartbeats.every((status) => status === 200), 'HTTP must remain responsive during scan');
    assert.ok(maxDelay < 500, `main event loop stalled for ${maxDelay}ms`);

    manager.start({ reason: 'test-incremental-scan' });
    const second = await waitForScan(manager);
    assert.strictEqual(second.result.unchanged, 1100, 'unchanged files should not be reprocessed');
    assert.strictEqual(second.result.addedOrUpdated, 0, 'incremental scan should avoid redundant writes');
    for (let index = 0; index < 25; index += 1) fs.unlinkSync(path.join(source, `document-${index}.txt`));
    manager.start({ reason: 'test-stale-cleanup' });
    const third = await waitForScan(manager);
    assert.strictEqual(third.result.removedMissing, 25, 'removed files should be deleted from the index');
    assert.strictEqual(db.listMedia({ limit: 1200 }).length, 1075, 'large indexes should clean stale rows without SQLite variable limits');
    const sourceId = db.listPaths()[0].id;
    const readdir = fs.promises.readdir;
    try {
      fs.promises.readdir = async (directory, ...args) => {
        if (directory === source) throw Object.assign(new Error('Source disconnected during traversal'), { code: 'EIO' });
        return readdir(directory, ...args);
      };
      const interrupted = await scanner.scanAll({ sourceId });
      assert.strictEqual(interrupted.removedMissing, 0, 'an interrupted traversal must not prune existing media');
      assert.strictEqual(db.listMedia({ limit: 1200 }).length, 1075, 'unreadable files remain indexed');
      assert.notStrictEqual(db.listPaths()[0].status, 'connected', 'incomplete scans must not report a healthy source');
    } finally {
      fs.promises.readdir = readdir;
    }
    const stat = fs.promises.stat;
    const inaccessible = path.join(source, 'document-25.txt');
    try {
      fs.promises.stat = async (file, ...args) => {
        if (file === inaccessible) throw Object.assign(new Error('File access denied'), { code: 'EACCES' });
        return stat(file, ...args);
      };
      const interrupted = await scanner.scanAll({ sourceId });
      assert.strictEqual(interrupted.removedMissing, 0, 'file stat failures must not be treated as confirmed deletions');
      assert.strictEqual(db.listMedia({ limit: 1200 }).length, 1075);
    } finally {
      fs.promises.stat = stat;
    }
    fs.renameSync(source, source + '-offline');
    try {
      const offline = await scanner.scanAll({ sourceId });
      assert.strictEqual(offline.removedMissing, 0, 'offline source retains its index');
      assert.strictEqual(db.listMedia({ limit: 1200 }).length, 1075);
    } finally {
      fs.renameSync(source + '-offline', source);
    }
    await scanner.scanAll({ sourceId });
    assert.strictEqual(db.listPaths()[0].status, 'connected', 'successful rescan restores source health');
    console.log(`[library-background-scan] ok; max event-loop delay ${maxDelay}ms; unchanged ${second.result.unchanged}; removed ${third.result.removedMissing}`);
  } finally {
    clearInterval(eventLoopProbe);
    await manager.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
