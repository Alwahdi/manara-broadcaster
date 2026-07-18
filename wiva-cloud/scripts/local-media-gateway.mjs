import { createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, open, readFile, readdir, rm } from "node:fs/promises";
import { once } from "node:events";
import { createServer } from "node:http";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import postgres from "postgres";

const PORT = Number(process.env.WIVA_LOCAL_GATEWAY_PORT || 5290);
const HOST = process.env.WIVA_LOCAL_GATEWAY_HOST || "0.0.0.0";
const TENANT = process.env.WIVA_TENANT_ID || "00000000-0000-0000-0000-000000000001";
const SIGNING_SECRET = process.env.WIVA_PLAYBACK_SIGNING_SECRET || "";
const CREDENTIALS_KEY = Buffer.from(process.env.WIVA_CREDENTIALS_KEY || "", "base64");
const DATABASE_URL = process.env.DATABASE_URL || "";
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const URI_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_BYTES = 128 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 320;
const MAX_RESOURCE_BYTES = 28 * 1024 * 1024;
const VOD_INITIAL_BYTES = 512 * 1024;
// Smaller ranges make random seeking responsive on ordinary mobile links. The
// shared LRU cache still coalesces viewers watching the same title.
const VOD_CHUNK_BYTES = 2 * 1024 * 1024;
const MAX_VOD_CACHE_BYTES = 128 * 1024 * 1024;
const MAX_VOD_SPOOL_BYTES = Number(process.env.WIVA_MAX_VOD_SPOOL_BYTES || 8 * 1024 * 1024 * 1024);
const MAX_VOD_SPOOL_TOTAL_BYTES = Number(process.env.WIVA_MAX_VOD_SPOOL_TOTAL_BYTES || 16 * 1024 * 1024 * 1024);
const VOD_IDLE_MS = 10 * 60 * 1000;
const LIVE_IDLE_MS = 45_000;
const AVAILABILITY_TTL_MS = 2_000;
const FFMPEG_PATH = process.env.WIVA_FFMPEG_PATH || ffmpegInstaller.path;
const INGEST_ROOT = join(tmpdir(), "wiva-cloud-live");
const VOD_SPOOL_ROOT = join(tmpdir(), "wiva-cloud-vod");

if (SIGNING_SECRET.length < 32 || CREDENTIALS_KEY.length !== 32 || !DATABASE_URL) throw new Error("Local gateway secrets/database are not configured");

const sql = postgres(DATABASE_URL, { max: 5 });
const sessions = new Map();
const uriTokens = new Map();
const liveIngests = new Map();
const cache = new Map();
const vodStates = new Map();
const vodChunks = new Map();
const resolvedChannels = new Map();
const assetAvailability = new Map();
const leaseAvailability = new Map();
const safeHosts = new Map();
const metrics = { upstreamRequests: 0, upstreamBytes: 0, downstreamBytes: 0, cacheHits: 0, coalesced: 0, errors: 0 };
let cacheBytes = 0;
let vodCacheBytes = 0;
let vodSpoolReservedBytes = 0;

function hmac(value) { return createHmac("sha256", SIGNING_SECRET).update(value).digest("base64url"); }
function safeEqual(left, right) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function decrypt(value) {
  const raw = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", CREDENTIALS_KEY, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
}
function privateIp(address) {
  const value = address.toLowerCase();
  if (value === "::1" || value === "::" || value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value)) return true;
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const a = Number(match[1]); const b = Number(match[2]);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}
async function assertSafeUrl(url, allowHttp) {
  if (url.username || url.password) throw new Error("unsafe upstream URL");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && allowHttp && process.env.WIVA_ALLOW_INSECURE_PROVIDER_HTTP === "true")) throw new Error("upstream protocol is not allowed");
  const cached = safeHosts.get(url.hostname);
  if (cached && cached > Date.now()) return;
  if (url.hostname === "localhost" || (isIP(url.hostname) && privateIp(url.hostname))) throw new Error("private upstream is not allowed");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => privateIp(entry.address))) throw new Error("private upstream is not allowed");
  safeHosts.set(url.hostname, Date.now() + 5 * 60 * 1000);
}
function cleanExpired() {
  const now = Date.now();
  for (const [key, value] of sessions) if (value.expiresAt < now) sessions.delete(key);
  for (const [key, value] of uriTokens) if (value.expiresAt < now) uriTokens.delete(key);
  for (const [key, value] of cache) if (!value.promise && value.expiresAt < now) { cache.delete(key); cacheBytes -= value.bytes || 0; }
  for (const [key, ingest] of liveIngests) if (ingest.lastAccess + LIVE_IDLE_MS < now) stopLiveIngest(key, ingest);
  for (const [key, state] of vodStates) if (state.lastAccess + VOD_IDLE_MS < now && state.pending.size === 0) dropVodState(key, state);
  for (const [key, value] of assetAvailability) if (value.expiresAt + 60_000 < now) assetAvailability.delete(key);
  for (const [key, value] of leaseAvailability) if (value.expiresAt + 60_000 < now) leaseAvailability.delete(key);
}

function vodState(channel) {
  let state = vodStates.get(channel.assetId);
  if (!state) {
    state = { channel, total: 0, contentType: "video/mp4", pending: new Map(), queue: Promise.resolve(), spool: null, lastAccess: Date.now() };
    vodStates.set(channel.assetId, state);
  }
  state.lastAccess = Date.now();
  return state;
}

function pruneVodCache() {
  while (vodCacheBytes > MAX_VOD_CACHE_BYTES && vodChunks.size) {
    const key = vodChunks.keys().next().value;
    const entry = vodChunks.get(key);
    vodChunks.delete(key);
    vodCacheBytes -= entry?.body?.length || 0;
  }
}

function vodChunkStart(index) { return index === 0 ? 0 : VOD_INITIAL_BYTES + (index - 1) * VOD_CHUNK_BYTES; }
function vodChunkIndex(offset) { return offset < VOD_INITIAL_BYTES ? 0 : 1 + Math.floor((offset - VOD_INITIAL_BYTES) / VOD_CHUNK_BYTES); }
function vodChunkEnd(index, total) {
  const start = vodChunkStart(index);
  const size = index === 0 ? VOD_INITIAL_BYTES : VOD_CHUNK_BYTES;
  return Math.min(total - 1, start + size - 1);
}

function notifySpool(spool) {
  for (const wake of spool.waiters) wake();
  spool.waiters.clear();
}

function dropVodState(key, state) {
  if (vodStates.get(key) === state) vodStates.delete(key);
  if (state.spool) {
    state.spool.abort.abort();
    vodSpoolReservedBytes = Math.max(0, vodSpoolReservedBytes - state.spool.total);
    void rm(state.spool.dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function waitForSpool(spool, end, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (spool.downloaded <= end && !spool.complete && !spool.error) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("انتهت مهلة تجهيز موضع الفيديو");
    await new Promise((resolve) => {
      const timer = setTimeout(() => { spool.waiters.delete(wake); resolve(); }, Math.min(remaining, 2_000));
      const wake = () => { clearTimeout(timer); resolve(); };
      spool.waiters.add(wake);
    });
  }
  if (spool.error) throw spool.error;
  if (spool.downloaded <= end) throw new Error("لم يكتمل تنزيل موضع الفيديو");
}

async function readSpoolChunk(state, index) {
  const spool = state.spool;
  if (!spool) throw new Error("ملف الفيديو المؤقت غير متاح");
  const start = vodChunkStart(index);
  const end = vodChunkEnd(index, spool.total);
  await waitForSpool(spool, end);
  const length = end - start + 1;
  const body = Buffer.allocUnsafe(length);
  const handle = await open(spool.path, "r");
  try {
    const { bytesRead } = await handle.read(body, 0, length, start);
    if (bytesRead !== length) throw new Error("تعذر قراءة موضع الفيديو");
  } finally { await handle.close(); }
  return { body, start, end, total: spool.total, contentType: state.contentType };
}

async function startVodSpool(state, response) {
  if (state.spool) return state.spool;
  const total = Number(response.headers.get("content-length") || 0);
  if (!Number.isSafeInteger(total) || total <= 0 || total > MAX_VOD_SPOOL_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new Error("ملف الفيديو لا يدعم التقديم السريع");
  }
  if (vodSpoolReservedBytes + total > MAX_VOD_SPOOL_TOTAL_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new Error("ذاكرة الفيديو المؤقتة مشغولة حاليًا");
  }
  const dir = join(VOD_SPOOL_ROOT, `${state.channel.assetId}-${randomBytes(4).toString("hex")}`);
  const path = join(dir, "media.bin");
  await mkdir(dir, { recursive: true });
  const spool = { dir, path, total, downloaded: 0, complete: false, error: null, waiters: new Set(), abort: new AbortController() };
  state.spool = spool; state.total = total;
  state.contentType = response.headers.get("content-type") || state.contentType;
  vodSpoolReservedBytes += total;
  void (async () => {
    const writer = createWriteStream(path, { flags: "wx" });
    try {
      if (!response.body) throw new Error("الفيديو غير متاح");
      const reader = response.body.getReader();
      spool.abort.signal.addEventListener("abort", () => void reader.cancel(), { once: true });
      while (!spool.abort.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!writer.write(Buffer.from(value))) await once(writer, "drain");
        spool.downloaded += value.byteLength;
        metrics.upstreamBytes += value.byteLength;
        notifySpool(spool);
      }
      writer.end(); await once(writer, "finish");
      if (!spool.abort.signal.aborted && spool.downloaded !== total) throw new Error("انقطع تنزيل الفيديو قبل اكتماله");
      spool.complete = !spool.abort.signal.aborted;
    } catch (error) {
      writer.destroy();
      if (!spool.abort.signal.aborted) spool.error = error instanceof Error ? error : new Error("تعذر تجهيز الفيديو");
    } finally { notifySpool(spool); }
  })();
  return spool;
}

async function fetchVodChunk(state, index) {
  const key = `${state.channel.assetId}:${index}`;
  const cached = vodChunks.get(key);
  if (cached) {
    vodChunks.delete(key); vodChunks.set(key, cached); metrics.cacheHits += 1;
    return cached;
  }
  if (state.pending.has(index)) { metrics.coalesced += 1; return state.pending.get(index); }
  const task = state.queue.catch(() => {}).then(async () => {
    if (state.spool) {
      const value = await readSpoolChunk(state, index);
      vodChunks.set(key, value); vodCacheBytes += value.body.length; pruneVodCache();
      return value;
    }
    const start = vodChunkStart(index);
    const size = index === 0 ? VOD_INITIAL_BYTES : VOD_CHUNK_BYTES;
    const end = state.total ? Math.min(state.total - 1, start + size - 1) : start + size - 1;
    const target = new URL(state.channel.ingest);
    await assertSafeUrl(target, state.channel.allowHttp);
    metrics.upstreamRequests += 1;
    const controller = new AbortController();
    const connectTimeout = setTimeout(() => controller.abort(), 30_000);
    const response = await fetch(target, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "WIVA-Media-Gateway/1.0", accept: "video/*,*/*", range: `bytes=${start}-${end}` },
    }).finally(() => clearTimeout(connectTimeout));
    if (response.status === 200 && start === 0) {
      await startVodSpool(state, response);
      const value = await readSpoolChunk(state, index);
      vodChunks.set(key, value); vodCacheBytes += value.body.length; pruneVodCache();
      return value;
    }
    if (response.status !== 206) {
      await response.body?.cancel().catch(() => {});
      throw new Error("المزوّد لا يدعم التقديم داخل هذا الملف");
    }
    const match = (response.headers.get("content-range") || "").match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i);
    if (!match || Number(match[1]) !== start) throw new Error("المزوّد أرسل نطاق فيديو غير صالح");
    const body = await readResponse(response);
    const actualEnd = Number(match[2]); const total = Number(match[3]);
    if (!Number.isSafeInteger(total) || total <= 0 || body.length !== actualEnd - start + 1) throw new Error("حجم ملف الفيديو غير صالح");
    state.total = total;
    state.contentType = response.headers.get("content-type") || state.contentType;
    const value = { body, start, end: actualEnd, total, contentType: state.contentType };
    vodChunks.set(key, value); vodCacheBytes += body.length; metrics.upstreamBytes += body.length; pruneVodCache();
    return value;
  });
  state.pending.set(index, task); state.queue = task.then(() => undefined, () => undefined);
  try { return await task; }
  finally { state.pending.delete(index); }
}

function requestedVodRange(header, total) {
  const match = String(header || "").match(/^bytes=(\d*)-(\d*)$/i);
  if (!match || (!match[1] && !match[2])) return { start: 0, end: vodChunkEnd(0, total) };
  if (!match[1]) {
    const suffix = Math.min(total, Math.max(1, Number(match[2]) || 1));
    const start = total - suffix;
    return { start, end: Math.min(total - 1, vodChunkEnd(vodChunkIndex(start), total)) };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : total - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= total || requestedEnd < start) return null;
  return { start, end: Math.min(total - 1, requestedEnd, vodChunkEnd(vodChunkIndex(start), total)) };
}

async function sendVodMedia(req, res, session) {
  if (session.channel.mediaType === "live") throw new Error("القناة المباشرة لا تدعم التقديم");
  const state = vodState(session.channel);
  if (!state.total) await fetchVodChunk(state, 0);
  const range = requestedVodRange(req.headers.range, state.total);
  if (!range) {
    res.writeHead(416, { "content-range": `bytes */${state.total}`, "accept-ranges": "bytes", "access-control-allow-origin": "*" });
    return res.end();
  }
  if (req.method === "HEAD") {
    res.writeHead(200, { "content-length": state.total, "content-type": state.contentType, "accept-ranges": "bytes", "cache-control": "private, max-age=30", "access-control-allow-origin": "*" });
    return res.end();
  }
  const firstIndex = vodChunkIndex(range.start);
  const lastIndex = vodChunkIndex(range.end);
  const loaded = [];
  for (let index = firstIndex; index <= lastIndex; index += 1) loaded.push(await fetchVodChunk(state, index));
  const merged = Buffer.concat(loaded.map((entry) => entry.body));
  const offset = range.start - vodChunkStart(firstIndex);
  const body = merged.subarray(offset, offset + (range.end - range.start + 1));
  metrics.downstreamBytes += body.length;
  res.writeHead(206, {
    "content-range": `bytes ${range.start}-${range.end}/${state.total}`,
    "accept-ranges": "bytes",
    "content-length": body.length,
    "content-type": state.contentType,
    "cache-control": "private, max-age=30",
    "access-control-allow-origin": "*",
    "referrer-policy": "no-referrer",
  });
  res.end(body);
  // Keep a small two-block runway. The per-title queue still permits only one
  // upstream request at a time and avoids downloading an unwatched movie.
  for (let offset = 1; offset <= 2; offset += 1) {
    const nextIndex = lastIndex + offset;
    if (vodChunkStart(nextIndex) < state.total) void fetchVodChunk(state, nextIndex).catch(() => {});
  }
}

function stopLiveIngest(key, ingest) {
  if (liveIngests.get(key) !== ingest) return;
  liveIngests.delete(key);
  if (!ingest.process.killed) ingest.process.kill("SIGTERM");
  void rm(ingest.dir, { recursive: true, force: true }).catch(() => {});
}

function revokeAssetRuntime(assetId) {
  resolvedChannels.delete(assetId);
  const revokedSessions = new Set();
  for (const [token, session] of sessions) {
    if (session.channel.assetId !== assetId) continue;
    revokedSessions.add(token); sessions.delete(token);
  }
  for (const [token, resource] of uriTokens) if (revokedSessions.has(resource.sessionToken)) uriTokens.delete(token);
  const ingest = liveIngests.get(assetId);
  if (ingest) stopLiveIngest(assetId, ingest);
  const state = vodStates.get(assetId);
  if (state) dropVodState(assetId, state);
  for (const [key, entry] of vodChunks) {
    if (!key.startsWith(`${assetId}:`)) continue;
    vodChunks.delete(key); vodCacheBytes -= entry?.body?.length || 0;
  }
}

async function assetIsAvailable(assetId) {
  const cached = assetAvailability.get(assetId);
  if (cached && cached.expiresAt > Date.now()) return cached.promise || cached.available;
  const promise = (async () => {
    const rows = await sql`
      select exists(
        select 1 from wiva_cloud_assets a
        join wiva_cloud_providers p on p.id = a.provider_id and p.tenant_id = a.tenant_id
        where a.tenant_id = ${TENANT} and a.id = ${assetId} and a.is_active = true
          and a.is_restricted = false and a.is_playable = true
          and p.status = 'active' and p.redistribution_attested = true
      ) as available
    `;
    return Boolean(rows[0]?.available);
  })();
  assetAvailability.set(assetId, { promise, available: false, expiresAt: Date.now() + AVAILABILITY_TTL_MS });
  try {
    const available = await promise;
    assetAvailability.set(assetId, { promise: null, available, expiresAt: Date.now() + AVAILABILITY_TTL_MS });
    if (!available) revokeAssetRuntime(assetId);
    return available;
  } catch (error) {
    assetAvailability.delete(assetId);
    throw error;
  }
}

async function markAssetHealthy(assetId) {
  await sql`
    update wiva_cloud_assets set consecutive_failures=0, last_success_at=now()
    where tenant_id=${TENANT} and id=${assetId} and consecutive_failures <> 0
  `.catch(() => undefined);
}

async function markAssetFailure(assetId) {
  await sql`
    update wiva_cloud_assets set
      consecutive_failures=consecutive_failures + 1,
      last_failure_at=now(),
      is_playable=case when consecutive_failures + 1 >= 3 then false else is_playable end,
      metadata_review=case when consecutive_failures + 1 >= 3 then 'needs_review' else metadata_review end
    where tenant_id=${TENANT} and id=${assetId}
  `.catch(() => undefined);
  assetAvailability.delete(assetId);
}

async function leaseIsActive(session) {
  if (!session.leaseId) return true;
  const cached = leaseAvailability.get(session.leaseId);
  if (cached && cached.expiresAt > Date.now()) return cached.active;
  const rows = await sql`
    select exists(
      select 1 from wiva_cloud_playback_leases l
      join wiva_cloud_viewers v on v.id=l.viewer_id and v.tenant_id=l.tenant_id
      where l.tenant_id=${TENANT} and l.lease_id=${session.leaseId}
        and l.viewer_id::text=${session.viewer} and l.asset_id=${session.channel.assetId}
        and l.expires_at > now() and v.status='active'
        and (v.expires_at is null or v.expires_at > now())
    ) as active
  `;
  const active = Boolean(rows[0]?.active);
  leaseAvailability.set(session.leaseId, { active, expiresAt: Date.now() + 12_000 });
  return active;
}

async function waitForLivePlaylist(ingest, timeoutMs = 15_000, minimumSegments = 3) {
  const playlist = join(ingest.dir, "index.m3u8");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (ingest.failed) throw new Error(ingest.failure || "تعذر فتح البث من المزوّد");
    if (existsSync(playlist)) {
      const files = await readdir(ingest.dir).catch(() => []);
      // Expose the manifest quickly; the web player waits for its measured
      // forward buffer before starting, so this does not sacrifice stability.
      if (files.filter((name) => /^seg-\d+\.ts$/.test(name)).length >= minimumSegments) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("انتهت مهلة تجهيز البث من المزوّد");
}

async function ensureLiveIngest(channel, ingestKey = channel.assetId) {
  const current = liveIngests.get(ingestKey);
  if (current && !current.failed) { current.lastAccess = Date.now(); await current.ready; return current; }
  if (current) stopLiveIngest(ingestKey, current);
  const dir = join(INGEST_ROOT, `${ingestKey.replace(/[^A-Za-z0-9_-]/g, "_")}-${randomBytes(4).toString("hex")}`);
  await mkdir(dir, { recursive: true });
  const vod = channel.mediaType !== "live";
  // Auto favors passthrough. Re-encoding every H.264 channel wasted CPU and
  // introduced tiny cadence stalls; incompatible feeds can explicitly choose
  // transcode from the admin catalog.
  const copyInput = vod || channel.deliveryMode !== "transcode";
  const videoCodecArgs = process.platform === "darwin" ? [
    "-c:v", "h264_videotoolbox", "-realtime", "1", "-allow_sw", "1",
  ] : [
    "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
  ];
  const codecArgs = copyInput ? ["-c", "copy"] : [
    ...videoCodecArgs,
    // 1080p25 exceeds H.264 level 3.1. Advertising the correct level avoids
    // hardware-decoder stalls on Android TVs and Samsung phones. Bound the
    // bitrate as well: uncapped sports footage previously exceeded 12 Mbps.
    "-profile:v", "main", "-level", "4.0", "-pix_fmt", "yuv420p",
    "-b:v", "4200k", "-maxrate", "4800k", "-bufsize", "8400k",
    "-g", "50", "-keyint_min", "50", "-sc_threshold", "0",
    "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-af", "aresample=async=1000:first_pts=0",
  ];
  const probeArgs = copyInput ? ["-analyzeduration", "1000000", "-probesize", "1048576"] : ["-analyzeduration", "100000", "-probesize", "65536"];
  // Two-second live segments substantially reduce playlist/HTTP churn on
  // mobile clients while still keeping channel startup responsive.
  const hlsTime = vod ? "6" : "2";
  const hlsArgs = vod
    ? ["-hls_list_size", "0", "-hls_playlist_type", "event", "-hls_flags", "append_list+independent_segments+program_date_time+temp_file"]
    : ["-hls_list_size", "24", "-hls_delete_threshold", "8", "-hls_flags", copyInput
      ? "delete_segments+append_list+omit_endlist+program_date_time+temp_file"
      : "delete_segments+append_list+omit_endlist+program_date_time+independent_segments+temp_file"];
  const args = [
    "-hide_banner", "-loglevel", "error", "-nostdin",
    "-rw_timeout", "15000000", "-reconnect", "1", "-reconnect_streamed", "1",
    "-reconnect_delay_max", "2", ...probeArgs,
    "-fflags", "+genpts+discardcorrupt", "-i", channel.ingest,
    "-map", "0:v:0?", "-map", "0:a:0?",
    // Preserve already browser-safe H.264/AAC feeds without re-encoding. Only
    // normalize MPEG-2/MP2-style feeds once at the shared ingest for mobile.
    ...codecArgs, "-max_muxing_queue_size", "2048", "-avoid_negative_ts", "make_non_negative",
    "-f", "hls", "-hls_time", hlsTime, "-hls_allow_cache", "1", ...hlsArgs,
    "-hls_segment_filename", join(dir, "seg-%08d.ts"), join(dir, "index.m3u8"),
  ];
  const child = spawn(FFMPEG_PATH, args, { stdio: ["ignore", "ignore", "pipe"] });
  const ingest = { process: child, dir, lastAccess: Date.now(), failed: false, failure: "", ready: null };
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-2000); });
  child.on("error", () => { ingest.failed = true; ingest.failure = "تعذر تشغيل محرك الوسائط المحلي"; });
  child.on("close", (code) => {
    if (code !== 0 && !child.killed) {
      ingest.failed = true;
      const cleaned = stderr.replace(/https?:\/\/\S+/g, "المصدر").trim();
      ingest.failure = cleaned.includes(" 4") ? "رفض المزوّد فتح القناة الآن" : "انقطع اتصال القناة من المزوّد";
    }
  });
  ingest.ready = waitForLivePlaylist(ingest, channel.mediaType === "live" ? 15_000 : 60_000, 1);
  liveIngests.set(ingestKey, ingest);
  try { await ingest.ready; void markAssetHealthy(channel.assetId); return ingest; }
  catch (error) { void markAssetFailure(channel.assetId); stopLiveIngest(ingestKey, ingest); throw error; }
}

function rewriteLocalLivePlaylist(body, session, requestOrigin) {
  const prefix = `${requestOrigin}/v1/session/${session.token}/live/`;
  return body.toString("utf8").split(/\r?\n/).map((line) => line && !line.startsWith("#") ? `${prefix}${encodeURIComponent(basename(line.trim()))}` : line).join("\n");
}
function evictCache() {
  cleanExpired();
  while (cache.size > MAX_CACHE_ENTRIES || cacheBytes > MAX_CACHE_BYTES) {
    const key = cache.keys().next().value;
    if (!key) break;
    const value = cache.get(key); cache.delete(key); cacheBytes -= value?.bytes || 0;
  }
}
async function readResponse(response) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(); const chunks = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > MAX_RESOURCE_BYTES) { await reader.cancel(); throw new Error("upstream resource exceeds safe limit"); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}
async function fetchResource(target, allowHttp, playlist = false) {
  const key = target.toString(); const existing = cache.get(key);
  if (existing?.body && existing.expiresAt > Date.now()) { metrics.cacheHits += 1; return existing; }
  if (existing?.promise) { metrics.coalesced += 1; return existing.promise; }
  const promise = (async () => {
    await assertSafeUrl(target, allowHttp);
    metrics.upstreamRequests += 1;
    const response = await fetch(target, { redirect: "follow", signal: AbortSignal.timeout(18_000), headers: { "user-agent": "WIVA-Media-Gateway/1.0", accept: playlist ? "application/vnd.apple.mpegurl,*/*" : "*/*" } });
    if (!response.ok) throw new Error(`upstream returned ${response.status}`);
    const body = await readResponse(response); metrics.upstreamBytes += body.length;
    const value = { body, contentType: response.headers.get("content-type") || (playlist ? "application/vnd.apple.mpegurl" : "application/octet-stream"), status: response.status, expiresAt: Date.now() + (playlist ? 1200 : 120_000), bytes: body.length };
    const old = cache.get(key); cacheBytes -= old?.bytes || 0; cache.set(key, value); cacheBytes += body.length; evictCache(); return value;
  })();
  cache.set(key, { promise, expiresAt: Date.now() + 20_000, bytes: 0 });
  try { return await promise; } catch (error) { cache.delete(key); metrics.errors += 1; throw error; }
}
function registerUri(session, url) {
  const token = randomBytes(24).toString("base64url");
  uriTokens.set(token, { sessionToken: session.token, url: url.toString(), expiresAt: Date.now() + URI_TTL_MS });
  return token;
}
function rewritePlaylist(session, body, playlistUrl, requestOrigin) {
  const base = new URL(playlistUrl); const text = body.toString("utf8");
  if (!text.trimStart().startsWith("#EXTM3U")) throw new Error("upstream did not return HLS");
  const prefix = `${requestOrigin}/v1/session/${session.token}/seg?t=`;
  return text.split(/\r?\n/).map((line) => {
    if (!line) return line;
    if (line.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${prefix}${encodeURIComponent(registerUri(session, new URL(uri, base)))}"`);
    return `${prefix}${encodeURIComponent(registerUri(session, new URL(line.trim(), base)))}`;
  }).join("\n");
}
async function resolveChannelFresh(assetId) {
  const rows = await sql`
    select a.id, a.kind, a.provider_asset_ref, a.delivery_mode, p.status, p.redistribution_attested, p.credentials_cipher
    from wiva_cloud_assets a join wiva_cloud_providers p on p.id = a.provider_id and p.tenant_id = a.tenant_id
    where a.tenant_id=${TENANT} and a.id=${assetId} and a.is_active=true
      and a.is_restricted=false and a.is_playable=true limit 1
  `;
  const row = rows[0];
  if (!row || row.status !== "active" || !row.redistribution_attested) throw new Error("asset is not available");
  const [scheme, kind, id, storedExtension] = String(row.provider_asset_ref).split(":");
  if (scheme !== "xtream" || !/^\d+$/.test(id || "")) throw new Error("المصدر المستورد غير قابل للتشغيل");
  const credentials = decrypt(row.credentials_cipher); const base = new URL(credentials.baseUrl);
  let ingest; let mediaType;
  if (kind === "live") { ingest = new URL(`/live/${encodeURIComponent(credentials.username || "")}/${encodeURIComponent(credentials.password || "")}/${id}.ts`, base); mediaType = "live"; }
  else if (kind === "episode") { const extension = String(row.provider_asset_ref).split(":")[3] || "mp4"; ingest = new URL(`/series/${encodeURIComponent(credentials.username || "")}/${encodeURIComponent(credentials.password || "")}/${id}.${extension}`, base); mediaType = "episode"; }
  else if (kind === "vod") {
    let extension = String(storedExtension || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
    if (!extension) {
      const infoUrl = new URL("/player_api.php", base);
      infoUrl.searchParams.set("username", credentials.username || ""); infoUrl.searchParams.set("password", credentials.password || "");
      infoUrl.searchParams.set("action", "get_vod_info"); infoUrl.searchParams.set("vod_id", id);
      await assertSafeUrl(infoUrl, credentials.allowInsecureHttp === "true");
      const response = await fetch(infoUrl, { redirect: "follow", signal: AbortSignal.timeout(25_000), headers: { "user-agent": "WIVA-Media-Gateway/1.0", accept: "application/json" } });
      if (!response.ok) throw new Error(`رفض المزوّد معلومات الفيلم (${response.status})`);
      const info = await response.json();
      extension = String(info?.movie_data?.container_extension || info?.info?.container_extension || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "mp4";
    }
    ingest = new URL(`/movie/${encodeURIComponent(credentials.username || "")}/${encodeURIComponent(credentials.password || "")}/${id}.${extension}`, base); mediaType = "movie";
  }
  else throw new Error(kind === "series" ? "افتح المسلسل واختر إحدى حلقاته" : "صيغة الفيلم الحالية غير مدعومة في مشغل الويب");
  await assertSafeUrl(ingest, credentials.allowInsecureHttp === "true");
  return { assetId, ingest: ingest.toString(), mediaType, deliveryMode: String(row.delivery_mode || "auto"), allowHttp: credentials.allowInsecureHttp === "true" };
}
async function resolveChannel(assetId) {
  const cached = resolvedChannels.get(assetId);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = resolveChannelFresh(assetId);
  resolvedChannels.set(assetId, { promise, expiresAt: Date.now() + 10 * 60 * 1000 });
  try { return await promise; }
  catch (error) { if (resolvedChannels.get(assetId)?.promise === promise) resolvedChannels.delete(assetId); throw error; }
}
function sendJson(res, status, value) { const body = JSON.stringify(value); res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), "cache-control": "no-store", "access-control-allow-origin": "*" }); res.end(body); }
function sendError(res, status, message) { metrics.errors += 1; sendJson(res, status, { ok: false, error: message }); }
function firstForwarded(value) { return String(value || "").split(",")[0].trim(); }
function origin(req) {
  const forwardedProto = firstForwarded(req.headers["x-forwarded-proto"]);
  const protocol = forwardedProto === "https" ? "https" : "http";
  const forwardedHost = firstForwarded(req.headers["x-forwarded-host"]);
  const host = forwardedHost || req.headers.host || `127.0.0.1:${PORT}`;
  return `${protocol}://${host}`;
}

const server = createServer(async (req, res) => {
  try {
    cleanExpired(); const url = new URL(req.url || "/", origin(req));
    if (url.pathname === "/health") {
      const ts = Number(url.searchParams.get("ts") || 0); const signature = url.searchParams.get("sig") || "";
      const authorized = Math.abs(Math.floor(Date.now() / 1000) - ts) <= 30 && safeEqual(signature, hmac(`health.${ts}`));
      return sendJson(res, 200, authorized ? { ok: true, service: "wiva-local-media-gateway", sessions: sessions.size, activeIngests: liveIngests.size, cacheEntries: cache.size, ...metrics } : { ok: true, service: "wiva-local-media-gateway" });
    }
    const play = url.pathname.match(/^\/v1\/play\/([0-9a-f-]+)\/(index\.m3u8|media)$/i);
    if (play) {
      const viewer = url.searchParams.get("viewer") || ""; const leaseId = url.searchParams.get("lease") || ""; const exp = Number(url.searchParams.get("exp") || 0); const accessExp = Number(url.searchParams.get("accessExp") || 0); const nonce = url.searchParams.get("nonce") || ""; const signature = url.searchParams.get("sig") || ""; const tenant = url.searchParams.get("tenant") || "";
      const nowSeconds = Math.floor(Date.now() / 1000);
      const legacyGrant = !accessExp;
      const effectiveAccessExp = legacyGrant ? nowSeconds + Math.floor(SESSION_TTL_MS / 1000) : accessExp;
      const expected = leaseId
        ? hmac(`${tenant}.${play[1]}.${viewer}.${leaseId}.${exp}.${accessExp}.${nonce}`)
        : legacyGrant
          ? hmac(`${tenant}.${play[1]}.${viewer}.${exp}.${nonce}`)
          : hmac(`${tenant}.${play[1]}.${viewer}..${exp}.${accessExp}.${nonce}`);
      const rollingLegacy = !leaseId && !legacyGrant ? hmac(`${tenant}.${play[1]}.${viewer}.${exp}.${accessExp}.${nonce}`) : "";
      if (tenant !== TENANT || !viewer || !nonce || exp < nowSeconds || exp > nowSeconds + 120 || effectiveAccessExp < nowSeconds || !(safeEqual(signature, expected) || (rollingLegacy && safeEqual(signature, rollingLegacy)))) return sendError(res, 403, "رابط التشغيل غير صالح أو منتهي");
      if (!(await assetIsAvailable(play[1]))) return sendError(res, 403, "المحتوى متوقف حاليًا");
      const channel = await resolveChannel(play[1]); const token = randomBytes(24).toString("base64url"); const session = { token, channel, viewer, leaseId, expiresAt: Math.min(Date.now() + SESSION_TTL_MS, effectiveAccessExp * 1000) };
      if (!(await leaseIsActive(session))) return sendError(res, 409, "وصل الحساب إلى الحد المسموح للمشاهدة المتزامنة");
      sessions.set(token, session);
      const resource = play[2] === "media" && channel.mediaType !== "live" ? "media" : "index.m3u8";
      res.writeHead(302, { location: `/v1/session/${token}/${resource}`, "cache-control": "no-store", "referrer-policy": "no-referrer", "access-control-allow-origin": "*" }); return res.end();
    }
    const sessionRoute = url.pathname.match(/^\/v1\/session\/([A-Za-z0-9_-]+)\/(index\.m3u8|media|seg|live\/[^/]+)$/);
    if (!sessionRoute) return sendError(res, 404, "المسار غير موجود");
    const session = sessions.get(sessionRoute[1]); if (!session || session.expiresAt < Date.now()) return sendError(res, 403, "انتهت جلسة التشغيل؛ أعد فتح القناة");
    if (!(await assetIsAvailable(session.channel.assetId))) return sendError(res, 403, "المحتوى متوقف حاليًا");
    if (!(await leaseIsActive(session))) { sessions.delete(session.token); return sendError(res, 409, "توقفت جلسة المشاهدة لأن حد الأجهزة المسموح قد تغيّر"); }
    if (sessionRoute[2] === "media") return await sendVodMedia(req, res, session);
    if (sessionRoute[2] === "index.m3u8") {
      const ingestKey = session.channel.assetId;
      const ingest = await ensureLiveIngest(session.channel, ingestKey); ingest.lastAccess = Date.now();
      const raw = await readFile(join(ingest.dir, "index.m3u8"));
      const body = Buffer.from(rewriteLocalLivePlaylist(raw, session, origin(req)));
      metrics.downstreamBytes += body.length;
      res.writeHead(200, { "content-type": "application/vnd.apple.mpegurl", "content-length": body.length, "cache-control": "no-cache", "access-control-allow-origin": "*", "referrer-policy": "no-referrer" }); return res.end(body);
    }
    if (sessionRoute[2].startsWith("live/")) {
      const ingestKey = session.channel.assetId;
      const ingest = await ensureLiveIngest(session.channel, ingestKey); ingest.lastAccess = Date.now();
      const filename = basename(decodeURIComponent(sessionRoute[2].slice(5)));
      if (!/^seg-\d+\.ts$/.test(filename)) return sendError(res, 404, "قطعة الفيديو غير موجودة");
      const body = await readFile(join(ingest.dir, filename)).catch(() => null);
      if (!body) return sendError(res, 404, "قطعة الفيديو انتهت؛ حدّث البث");
      metrics.downstreamBytes += body.length;
      res.writeHead(200, { "content-type": "video/mp2t", "content-length": body.length, "cache-control": "public, max-age=20", "access-control-allow-origin": "*", "referrer-policy": "no-referrer" }); return res.end(body);
    }
    let target = new URL(session.channel.ingest);
    if (sessionRoute[2] === "seg") {
      const resource = uriTokens.get(url.searchParams.get("t") || "");
      if (!resource || resource.sessionToken !== session.token || resource.expiresAt < Date.now()) return sendError(res, 403, "رمز قطعة الفيديو غير صالح");
      target = new URL(resource.url);
    }
    const resource = await fetchResource(target, session.channel.allowHttp, sessionRoute[2] === "index.m3u8" || target.pathname.endsWith(".m3u8"));
    const isPlaylist = /mpegurl/i.test(resource.contentType) || resource.body.subarray(0, 64).toString("utf8").trimStart().startsWith("#EXTM3U");
    const body = isPlaylist ? Buffer.from(rewritePlaylist(session, resource.body, target, origin(req))) : resource.body;
    metrics.downstreamBytes += body.length;
    res.writeHead(200, { "content-type": isPlaylist ? "application/vnd.apple.mpegurl" : resource.contentType, "content-length": body.length, "cache-control": isPlaylist ? "no-cache" : "public, max-age=30", "access-control-allow-origin": "*", "referrer-policy": "no-referrer" }); res.end(body);
  } catch (error) { sendError(res, 502, error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "المصدر") : "تعذر تشغيل المصدر"); }
});

server.listen(PORT, HOST, () => console.log(`[WIVA gateway] ready on http://${HOST}:${PORT}`));
const cleanupTimer = setInterval(cleanExpired, 15_000); cleanupTimer.unref();
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { clearInterval(cleanupTimer); for (const [key, ingest] of liveIngests) stopLiveIngest(key, ingest); server.close(); await sql.end(); process.exit(0); });
