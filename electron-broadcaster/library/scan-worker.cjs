const { parentPort, workerData } = require('worker_threads');
const db = require('./db.cjs');
const scanner = require('./scanner.cjs');

let lastProgressAt = 0;
let pendingProgress = null;
let progressTimer = null;

function postProgress(progress, immediate = false) {
  pendingProgress = progress;
  const now = Date.now();
  const flush = () => {
    if (!pendingProgress) return;
    parentPort.postMessage({ type: 'progress', progress: pendingProgress });
    pendingProgress = null;
    lastProgressAt = Date.now();
    progressTimer = null;
  };
  if (immediate || now - lastProgressAt >= 200) return flush();
  if (!progressTimer) progressTimer = setTimeout(flush, Math.max(1, 200 - (now - lastProgressAt)));
}

async function run() {
  try {
    db.init(workerData.dbPath, {});
    const result = await scanner.scanAll(workerData.scanOptions || {}, (progress) => {
      postProgress(progress, progress.stage === 'done' || progress.stage === 'source_unavailable' || progress.stage === 'source_indexed');
    });
    postProgress({ stage: 'done', done: result.done, total: result.total, message: 'اكتمل فحص الاستراحة' }, true);
    parentPort.postMessage({ type: 'complete', result });
  } catch (error) {
    parentPort.postMessage({
      type: 'error',
      error: String(error?.message || error || 'Library scan failed'),
      stack: String(error?.stack || ''),
    });
    process.exitCode = 1;
  }
}

run();
