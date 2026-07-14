const path = require('path');
const { Worker } = require('worker_threads');

function publicStatus(status) {
  return JSON.parse(JSON.stringify(status));
}

class LibraryScanManager {
  constructor({ dbPath, getScanOptions, onStatus, onComplete } = {}) {
    if (!dbPath) throw new Error('Library scan manager requires a database path');
    this.dbPath = dbPath;
    this.getScanOptions = typeof getScanOptions === 'function' ? getScanOptions : () => ({});
    this.onStatus = typeof onStatus === 'function' ? onStatus : () => {};
    this.onComplete = typeof onComplete === 'function' ? onComplete : () => {};
    this.worker = null;
    this.queued = null;
    this.cancelled = false;
    this.statusValue = {
      state: 'idle',
      active: false,
      queued: false,
      stage: 'idle',
      done: 0,
      total: 0,
      percent: 0,
      message: '',
      reason: '',
      sourceId: null,
      startedAt: null,
      finishedAt: null,
      error: '',
      result: null,
    };
  }

  status() {
    return publicStatus(this.statusValue);
  }

  emit(patch = {}) {
    const next = { ...this.statusValue, ...patch };
    next.percent = next.total > 0 ? Math.min(100, Math.round((next.done / next.total) * 100)) : (next.state === 'complete' ? 100 : 0);
    this.statusValue = next;
    try { this.onStatus(this.status()); } catch {}
  }

  start({ reason = 'manual', sourceId = null, force = false } = {}) {
    const request = { reason, sourceId, force: Boolean(force) };
    if (this.worker) {
      if (!this.queued) this.queued = request;
      else if (String(this.queued.sourceId || '') !== String(request.sourceId || '')) {
        this.queued = {
          reason: 'queued-library-changes',
          sourceId: null,
          force: Boolean(this.queued.force || request.force),
        };
      } else {
        this.queued = { ...request, force: Boolean(this.queued.force || request.force) };
      }
      this.emit({ queued: true, message: this.statusValue.message || 'يوجد فحص جارٍ، وسيتم تطبيق الطلب التالي تلقائيًا.' });
      return { accepted: false, queued: true, status: this.status() };
    }
    this.launch(request, 0);
    return { accepted: true, queued: false, status: this.status() };
  }

  launch(request, attempt) {
    this.cancelled = false;
    const scanOptions = { ...this.getScanOptions(), sourceId: request.sourceId, force: request.force };
    this.emit({
      state: 'running', active: true, queued: Boolean(this.queued), stage: 'starting',
      done: 0, total: 0, message: 'جاري بدء فحص الاستراحة في الخلفية…',
      reason: request.reason, sourceId: request.sourceId, startedAt: Date.now(), finishedAt: null,
      error: '', result: null,
    });
    const worker = new Worker(path.join(__dirname, 'scan-worker.cjs'), {
      workerData: { dbPath: this.dbPath, scanOptions },
    });
    this.worker = worker;
    let settled = false;

    const finish = async (state, payload = {}) => {
      if (settled) return;
      settled = true;
      if (this.worker === worker) this.worker = null;
      const result = payload.result || null;
      this.emit({
        state, active: false, stage: state, queued: Boolean(this.queued),
        done: result?.done ?? this.statusValue.done,
        total: result?.total ?? this.statusValue.total,
        message: state === 'complete' ? 'اكتمل فحص الاستراحة' : state === 'cancelled' ? 'تم إيقاف الفحص' : 'تعذر إكمال فحص الاستراحة',
        finishedAt: Date.now(), error: payload.error || '', result,
      });
      try { await this.onComplete(this.status()); } catch {}
      if (this.queued && state !== 'cancelled') {
        const next = this.queued;
        this.queued = null;
        setTimeout(() => this.launch(next, 0), 50);
      }
    };

    worker.on('message', (message) => {
      if (message?.type === 'progress') {
        const progress = message.progress || {};
        this.emit({
          ...progress,
          state: 'running', active: true,
          done: Number(progress.done || 0), total: Number(progress.total || 0),
        });
      } else if (message?.type === 'complete') {
        finish('complete', { result: message.result });
      } else if (message?.type === 'error') {
        if (!this.cancelled && attempt < 1) {
          settled = true;
          if (this.worker === worker) this.worker = null;
          this.emit({ message: 'تعطل عامل الفحص، جاري استعادته تلقائيًا…', error: message.error || '' });
          setTimeout(() => this.launch(request, attempt + 1), 150);
        } else {
          finish(this.cancelled ? 'cancelled' : 'error', { error: message.error || 'Library scan failed' });
        }
      }
    });
    worker.on('error', (error) => {
      if (!this.cancelled && attempt < 1) {
        settled = true;
        if (this.worker === worker) this.worker = null;
        this.emit({ message: 'تعطل عامل الفحص، جاري استعادته تلقائيًا…', error: String(error.message || error) });
        setTimeout(() => this.launch(request, attempt + 1), 150);
      } else {
        finish(this.cancelled ? 'cancelled' : 'error', { error: String(error.message || error) });
      }
    });
    worker.on('exit', (code) => {
      if (!settled) finish(this.cancelled ? 'cancelled' : 'error', { error: `Scan worker exited before completing (code ${code})` });
    });
  }

  async cancel() {
    this.queued = null;
    this.cancelled = true;
    const worker = this.worker;
    if (!worker) return { ok: true, status: this.status() };
    this.emit({ state: 'cancelled', active: false, queued: false, stage: 'cancelled', message: 'تم إيقاف الفحص', finishedAt: Date.now() });
    await worker.terminate();
    return { ok: true, status: this.status() };
  }

  async close() {
    this.queued = null;
    this.cancelled = true;
    if (this.worker) await this.worker.terminate();
    this.worker = null;
  }
}

module.exports = { LibraryScanManager };
