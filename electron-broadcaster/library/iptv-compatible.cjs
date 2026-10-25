// Browser compatibility sessions. Inputs go through the existing accounted IPTV
// proxy; the provider URL/headers never appear in playlists or viewer errors.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

function executable() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  return require('@ffmpeg-installer/ffmpeg').path.replace(
    `${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`,
  );
}

function createCompatibility(options = {}) {
  const launch = options.spawn || spawn;
  const getExecutable = options.executable || executable;
  const idleMs = options.idleMs || 60000;
  const waitMs = options.waitMs || 40000;
  const maxSessions = options.maxSessions || 4;
  const sessions = new Map();
  const probes = new Map();
  const probeChildren = new Set();
  const generations = new Map();
  const root = fs.mkdtempSync(path.join(options.tempRoot || os.tmpdir(), 'wiva-iptv-'));
  const bridgeToken = crypto.randomBytes(32).toString('hex');
  let stopped = false;

  function fingerprint(channel) {
    return crypto.createHash('sha256').update(JSON.stringify([
      String(channel.id), channel.url, channel.headers || {},
    ])).digest('hex').slice(0, 24);
  }

  function dispose(session) {
    if (sessions.get(session.key) === session) sessions.delete(session.key);
    clearInterval(session.timer);
    session.disposed = true;
    if (session.child && session.child.exitCode === null) session.child.kill();
    const remove = () => fs.rm(session.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }, () => {});
    if (session.child && session.child.exitCode === null) session.child.once('close', remove);
    else remove();
  }

  function inspect(key, input) {
    const cached = probes.get(key);
    if (cached && cached.until > Date.now()) return cached.promise;
    if (probeChildren.size + sessions.size >= maxSessions) return Promise.reject(new Error('capacity'));
    // Bound metadata as well as worker count. Failed/empty probes are not cached.
    for (const [id, row] of probes) if (row.until <= Date.now()) probes.delete(id);
    if (probes.size >= 256) probes.delete(probes.keys().next().value);
    const promise = new Promise((resolve, reject) => {
      let log = '', done = false, child;
      const finish = (error, value) => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        if (error) reject(error); else resolve(value);
      };
      const timeout = setTimeout(() => { child?.kill(); finish(new Error('probe_timeout')); }, 20000);
      try {
        child = launch(getExecutable(), ['-hide_banner', '-nostdin', '-rw_timeout', '12000000',
          '-analyzeduration', '3000000', '-probesize', '3000000', '-i', input,
          '-t', '0', '-f', 'null', '-'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
        probeChildren.add(child);
        child.stderr.on('data', (chunk) => { log = (log + chunk).slice(-24000); });
        child.once('error', () => finish(new Error('decoder_unavailable')));
        child.once('close', () => {
          probeChildren.delete(child);
          const inputLog = log.split('Stream mapping:')[0];
          const video = inputLog.match(/Video:\s*([\w]+)/i)?.[1]?.toLowerCase();
          const audio = inputLog.match(/Audio:\s*([\w]+)/i)?.[1]?.toLowerCase();
          if (!video) finish(new Error('no_video'));
          else finish(null, { video, audio });
        });
      } catch { finish(new Error('decoder_unavailable')); }
    });
    probes.set(key, { promise, until: Date.now() + 5 * 60 * 1000 });
    promise.catch(() => { if (probes.get(key)?.promise === promise) probes.delete(key); });
    return promise;
  }

  async function prepare(channel, input, force) {
    if (stopped) throw new Error('closed');
    const key = fingerprint(channel);
    generations.set(String(channel.id), key);
    if (generations.size > 256) generations.delete(generations.keys().next().value);
    // A changed source is a different generation, including when the channel ID
    // stays the same. Never allow an old worker to overwrite a new playlist.
    for (const session of sessions.values()) {
      if (session.channelId === String(channel.id) && session.key !== key) dispose(session);
    }
    const existing = sessions.get(key);
    if (existing && !existing.failed && (!force || existing.transcoded)) { existing.lastHit = Date.now(); return existing; }
    if (existing) dispose(existing);
    const codecs = await inspect(key, input);
    if (stopped) throw new Error('closed');
    if (generations.get(String(channel.id)) !== key) throw new Error('source_changed');
    // Keep the original cached/coalesced HLS path for widely supported codecs.
    if (!force && /\.m3u8(?:\?|$)/i.test(channel.url) && codecs.video === 'h264' && (!codecs.audio || codecs.audio === 'aac')) return null;
    const raced = sessions.get(key);
    if (raced && !raced.failed && (!force || raced.transcoded)) { raced.lastHit = Date.now(); return raced; }
    if (raced) dispose(raced);
    if (sessions.size >= maxSessions) throw new Error('capacity');
    const id = crypto.randomBytes(12).toString('hex');
    const dir = path.join(root, id);
    fs.mkdirSync(dir);
    const session = { key, id, dir, channelId: String(channel.id), createdAt: Date.now(), lastHit: Date.now(), failed: false, disposed: false, child: null };
    const transcode = force || codecs.video !== 'h264';
    session.transcoded = transcode;
    session.files = new Map();
    session.cacheBytes = 0;
    const args = ['-hide_banner', '-nostdin', '-loglevel', 'warning', '-rw_timeout', '15000000',
      '-threads', '2', '-i', input, '-map', '0:v:0', '-map', '0:a:0?'];
    if (transcode) args.push('-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2,fps=25', '-c:v', 'libx264', '-threads', '2',
      '-preset', 'ultrafast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p', '-crf', '24',
      '-maxrate', '4500k', '-bufsize', '9000k',
      '-force_key_frames', 'expr:gte(t,n_forced*2)');
    else args.push('-c:v', 'copy');
    args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-max_muxing_queue_size', '1024',
      '-f', 'hls', '-hls_time', '2', '-hls_list_size', '8', '-hls_delete_threshold', '2',
      '-hls_flags', 'delete_segments+temp_file', '-hls_segment_filename', 'segment%09d.ts', 'index.m3u8');
    try {
      session.child = launch(getExecutable(), args, { cwd: dir, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      // Drain stderr without retaining provider URLs or unbounded logs.
      session.child.stderr.on('data', () => {});
      session.child.once('error', () => { session.failed = true; });
      session.child.once('close', () => { session.failed = true; });
    } catch { fs.rmSync(dir, { recursive: true, force: true }); throw new Error('decoder_unavailable'); }
    session.timer = setInterval(() => {
      let lastOutput = session.createdAt;
      try { lastOutput = fs.statSync(path.join(session.dir, 'index.m3u8')).mtimeMs; } catch {}
      if (session.failed || Date.now() - session.lastHit >= idleMs || Date.now() - lastOutput > 45000) dispose(session);
    }, Math.min(idleMs, 5000));
    session.timer.unref?.();
    sessions.set(key, session);
    return session;
  }

  function error(res, code = 503, reason = 'unavailable') {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
      'Retry-After': '3', 'X-Wiva-Playback-Error': reason });
    res.end(reason === 'capacity' ? 'خادم البث مشغول مؤقتًا. أعد المحاولة.' : 'تعذّر تجهيز صورة البث الآن. نحاول إعادة الاتصال.');
  }

  async function serve(channel, sub, query, req, res, base, hooks) {
    if (sub === 'playback.m3u8') {
      try {
        const input = `http://127.0.0.1:${req.socket.localPort}/iptv/${encodeURIComponent(channel.id)}/index.m3u8?bridge=${bridgeToken}`;
        const session = await prepare(channel, input, query.compat === '1');
        if (res.destroyed) return;
        if (!session) return hooks.direct();
        const deadline = Date.now() + waitMs;
        while (!session.failed && !session.disposed && !res.destroyed && Date.now() < deadline) {
          if (fs.existsSync(path.join(session.dir, 'index.m3u8'))) {
            // A unique URL isolates segment caches and late events on reconnect.
            res.writeHead(302, { Location: `${base}/compat/${session.id}/index.m3u8`, 'Cache-Control': 'no-store' });
            res.end();
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
        error(res);
      } catch (e) { error(res, 503, e.message === 'capacity' ? 'capacity' : 'unavailable'); }
      return;
    }
    const match = /^compat\/([a-f0-9]{24})\/(index\.m3u8|segment\d{9}\.ts)$/.exec(sub);
    const session = match && [...sessions.values()].find((row) => row.id === match[1] && row.key === fingerprint(channel));
    if (!session || session.failed || session.disposed) { error(res, 503); return; }
    session.lastHit = Date.now();
    try {
      const file = path.join(session.dir, match[2]);
      const stat = await fs.promises.stat(file);
      if (stat.size > 32 * 1024 * 1024) { error(res); return; }
      let body;
      if (match[2].endsWith('.ts')) {
        let cached = session.files.get(match[2]);
        if (!cached) {
          // Coalesce disk reads and share immutable segment buffers across LAN
          // viewers. Retain at most eight segments (32 MB) per worker.
          cached = { promise: fs.promises.readFile(file), bytes: stat.size };
          session.files.set(match[2], cached);
          session.cacheBytes += stat.size;
          cached.promise.catch(() => {
            const failed = session.files.get(match[2]);
            if (failed) { session.cacheBytes -= failed.bytes; session.files.delete(match[2]); }
          });
          while (session.files.size > 8 || session.cacheBytes > 32 * 1024 * 1024) {
            const oldest = session.files.keys().next().value;
            session.cacheBytes -= session.files.get(oldest).bytes;
            session.files.delete(oldest);
          }
        }
        body = await cached.promise;
      } else body = await fs.promises.readFile(file);
      if (res.destroyed) return;
      hooks.touch();
      res.writeHead(200, { 'Content-Type': match[2].endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' });
      await hooks.write(body);
    } catch { error(res); }
  }

  function close() {
    stopped = true;
    for (const session of sessions.values()) dispose(session);
    for (const child of probeChildren) child.kill();
    probeChildren.clear();
    probes.clear();
    generations.clear();
    fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }, () => {});
  }
  return { serve, close, bridgeToken, fingerprint, prepare,
    status: () => [...sessions.values()].map((s) => ({ channelId: s.channelId, failed: s.failed, idleMs: Date.now() - s.lastHit })) };
}

module.exports = { createCompatibility };
