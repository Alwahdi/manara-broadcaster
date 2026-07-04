// WIVA — Windows-safe atomic file writes.
//
// The classic "write to a .tmp file then rename over the destination" pattern is
// atomic on POSIX, but on Windows `rename` fails intermittently with EPERM,
// EACCES, EBUSY, or EEXIST whenever antivirus, Windows Search indexing, a backup
// agent, or another handle briefly locks the destination file. That is the root
// cause of the recurring "cannot save on Windows" reports: a settings/channel
// save would throw and the change was silently lost.
//
// These helpers make saving reliable everywhere:
//   1. Write the payload to a unique temp file and fsync it to disk.
//   2. Rename it over the destination, retrying with short backoff on the
//      transient Windows lock errors above.
//   3. On the last retry, remove the destination and try once more.
//   4. If rename still fails, write the payload in place so the data is never
//      lost, then clean up the temp file.
const fs = require('fs');
const path = require('path');

const TRANSIENT_CODES = new Set(['EPERM', 'EACCES', 'EBUSY', 'EEXIST', 'ENOTEMPTY', 'UNKNOWN']);
const MAX_RENAME_ATTEMPTS = 6;

function isTransientLockError(err) {
  return !!err && TRANSIENT_CODES.has(err.code);
}

function backoffMs(attempt) {
  // 15ms, 30ms, 45ms ... capped so a stuck lock never blocks the process long.
  return Math.min(15 * (attempt + 1), 120);
}

function sleepSync(ms) {
  if (!(ms > 0)) return;
  // Synchronous sleep without busy-spinning the CPU. Falls back to a bounded
  // busy wait if SharedArrayBuffer/Atomics are unavailable.
  try {
    const shared = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(shared, 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) { /* wait */ }
  }
}

function writeFileAtomic(destPath, data, options = {}) {
  if (!destPath) throw new Error('writeFileAtomic requires a destination path');
  const dir = path.dirname(destPath);
  fs.mkdirSync(dir, { recursive: true });

  const encoding = options.encoding
    || (typeof data === 'string' ? 'utf8' : undefined);
  const writeOptions = encoding ? { encoding } : undefined;
  const tmp = `${destPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;

  try {
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, data, writeOptions);
      try { fs.fsyncSync(fd); } catch { /* fsync not supported on some FS */ }
    } finally {
      fs.closeSync(fd);
    }

    for (let attempt = 0; attempt < MAX_RENAME_ATTEMPTS; attempt++) {
      try {
        fs.renameSync(tmp, destPath);
        return;
      } catch (err) {
        if (!isTransientLockError(err)) throw err;
        // Give the locking process time to release the handle, then retry.
        sleepSync(backoffMs(attempt));
        // Second-to-last attempt: proactively remove the destination so the
        // final rename has a clear target.
        if (attempt === MAX_RENAME_ATTEMPTS - 2) {
          try { fs.rmSync(destPath, { force: true }); } catch { /* ignore */ }
        }
      }
    }

    // Rename kept failing (destination stayed locked). Persist in place so the
    // save is not lost, then discard the temp file.
    fs.writeFileSync(destPath, data, writeOptions);
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
    throw err;
  }
}

function writeJsonAtomic(destPath, value, options = {}) {
  const space = options.space === undefined ? 2 : options.space;
  writeFileAtomic(destPath, JSON.stringify(value, null, space), { encoding: 'utf8' });
}

module.exports = { writeFileAtomic, writeJsonAtomic };
