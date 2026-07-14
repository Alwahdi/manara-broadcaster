// WIVA — filesystem scanner for media library
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawn } = require('child_process');
const db = require('./db.cjs');
const tmdb = require('./tmdb.cjs');

const VIDEO_EXT = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.ts', '.flv', '.wmv']);
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.aac', '.wma', '.opus']);
const BOOK_EXT = new Set(['.pdf', '.epub', '.mobi', '.azw', '.azw3', '.cbz', '.cbr', '.djvu']);
const DOCUMENT_EXT = new Set(['.txt', '.md', '.rtf', '.doc', '.docx', '.odt', '.ppt', '.pptx', '.xls', '.xlsx', '.csv']);
const SUB_EXT = new Set(['.srt', '.vtt', '.ass']);
const ARTWORK_EXT = new Set(['.jpg', '.jpeg', '.jpe', '.jfif', '.png', '.webp', '.avif', '.gif', '.bmp']);
const URL_FILE = 'url.txt';
const SYSTEM_DIRS = new Set(['.git', 'node_modules', '$recycle.bin', 'system volume information', '@eadir']);
const SYSTEM_FILES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);

// Parse filename like: "Movie Name (2021).mkv" or "Show.S01E03.Title.mkv"
function parseName(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  // TV: SxxExx
  const tv = base.match(/^(.*?)[. _-]+[Ss](\d{1,2})[Ee](\d{1,3})/);
  if (tv) {
    return {
      kind: 'episode',
      title: clean(tv[1]),
      season: parseInt(tv[2], 10),
      episode: parseInt(tv[3], 10),
    };
  }
  // Movie with year
  const yr = base.match(/^(.*?)[. _-]+\(?(\d{4})\)?/);
  if (yr) {
    return { kind: 'movie', title: clean(yr[1]), year: parseInt(yr[2], 10) };
  }
  return { kind: 'movie', title: clean(base) };
}
function clean(s) {
  return s.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function metadataCandidates(item, folder, parsedFile) {
  const candidates = [];
  if (item.kind === 'movie' && folder) {
    const parsedFolder = parseName(path.basename(folder));
    if (parsedFolder.title && !/^(movies?|films?|videos?|أفلام|فيديوهات)$/i.test(parsedFolder.title)) {
      candidates.push({ title: parsedFolder.title, year: parsedFolder.year || item.year });
    }
  }
  candidates.push({ title: parsedFile.title || item.title, year: parsedFile.year || item.year });
  return candidates.filter((candidate, index, all) => candidate.title && all.findIndex((row) => row.title === candidate.title && row.year === candidate.year) === index);
}

function sourceLabel(lp) {
  return lp.label || path.basename(String(lp.path || '').replace(/[\\/]+$/, '')) || lp.path || 'مصدر المكتبة';
}

function sourceReadable(dir) {
  try {
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) return { ok: false, status: 'missing', message: 'المسار ليس مجلداً.' };
    fs.accessSync(dir, fs.constants.R_OK);
    return { ok: true, status: 'connected', message: '' };
  } catch (e) {
    return {
      ok: false,
      status: e && (e.code === 'EACCES' || e.code === 'EPERM') ? 'permission_error' : 'disconnected',
      message: e?.code === 'EACCES' || e?.code === 'EPERM'
        ? 'لا توجد صلاحية قراءة لهذا المصدر.'
        : 'المصدر غير متصل حالياً أو لا يمكن الوصول إليه.',
    };
  }
}

function normalizeStoredPathList(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((entry) => String(entry || '').trim()).filter(Boolean);
    } catch {}
  }
  return [];
}

function normalizeForCompare(value) {
  return path.resolve(String(value || '')).replace(/[\\/]+$/g, '').toLowerCase();
}

function excludeMatcher(source) {
  const root = path.resolve(String(source?.path || ''));
  const excludes = normalizeStoredPathList(source?.exclude_paths ?? source?.excludePaths)
    .map((entry) => {
      const raw = String(entry || '').trim();
      const absolute = path.isAbsolute(raw) ? raw : path.join(root, raw);
      return normalizeForCompare(absolute);
    })
    .filter(Boolean);
  return (target) => {
    if (!excludes.length) return false;
    const clean = normalizeForCompare(target);
    return excludes.some((excluded) => clean === excluded || clean.startsWith(excluded + path.sep.toLowerCase()) || clean.startsWith(excluded + '/'));
  };
}

function shouldSkipEntry(entry, fullPath, isExcluded) {
  const name = String(entry?.name || '');
  const lower = name.toLowerCase();
  if (!name || name.startsWith('.')) return true;
  if (entry.isDirectory() && SYSTEM_DIRS.has(lower)) return true;
  if (entry.isFile() && SYSTEM_FILES.has(lower)) return true;
  return isExcluded(fullPath);
}

async function walk(dir, out = [], report = { folderCount: 0, permissionErrors: [] }, options = {}) {
  const isExcluded = typeof options.isExcluded === 'function' ? options.isExcluded : () => false;
  const pending = [dir];
  let visited = 0;
  while (pending.length) {
    const current = pending.pop();
    let entries;
    try { entries = await fs.promises.readdir(current, { withFileTypes: true }); }
    catch (e) {
      report.permissionErrors.push({ path: current, error: e.message });
      continue;
    }
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (shouldSkipEntry(e, full, isExcluded)) continue;
      if (e.isDirectory()) {
        report.folderCount += 1;
        pending.push(full);
      } else if (e.isFile()) {
        out.push(full);
      }
      visited += 1;
      if (visited % 250 === 0) await new Promise((resolve) => setImmediate(resolve));
    }
  }
  return out;
}

function readUrlFile(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const url = raw.find((line) => /^https?:\/\//i.test(line));
    return url || null;
  } catch { return null; }
}

function thumbnailName(file) {
  return crypto.createHash('sha1').update(String(file)).digest('hex') + '.jpg';
}

function validStoredArtwork(value, thumbnailDir) {
  const artwork = String(value || '');
  if (!artwork) return '';
  const thumb = /^\/media-thumb\/([a-f0-9]{40}\.jpg)$/i.exec(artwork);
  if (!thumb) return artwork;
  try {
    const file = path.join(String(thumbnailDir || ''), thumb[1]);
    return thumbnailDir && fs.existsSync(file) && fs.statSync(file).size > 512 ? artwork : '';
  } catch {
    return '';
  }
}

function ffmpegExecutable() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const bundled = String(require('@ffmpeg-installer/ffmpeg').path || '');
    const unpacked = bundled.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
    if (unpacked) return unpacked;
  } catch {}
  const executable = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const resources = String(process.resourcesPath || '');
  const candidates = resources ? [
    path.join(resources, executable),
    path.join(resources, 'bin', executable),
  ] : [];
  return candidates.find((candidate) => {
    try { return fs.existsSync(candidate) && fs.statSync(candidate).isFile(); } catch { return false; }
  }) || 'ffmpeg';
}

async function generateVideoThumbnail(file, thumbnailDir) {
  if (!thumbnailDir || !file || /^https?:\/\//i.test(String(file))) return '';
  const outName = thumbnailName(file);
  const outFile = path.join(thumbnailDir, outName);
  try {
    if (fs.existsSync(outFile) && fs.statSync(outFile).size > 512) return `/media-thumb/${outName}`;
    fs.mkdirSync(thumbnailDir, { recursive: true });
  } catch {
    return '';
  }
  return new Promise((resolve) => {
    const ffmpeg = ffmpegExecutable();
    let child;
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    try {
      child = spawn(ffmpeg, [
        '-y',
        '-ss', '00:00:03',
        '-i', file,
        '-frames:v', '1',
        '-threads', '1',
        '-vf', 'scale=640:-1',
        '-q:v', '5',
        outFile,
      ], { stdio: 'ignore', windowsHide: true });
    } catch (error) {
      console.warn('[WIVA] thumbnail generator could not start:', error.message);
      finish('');
      return;
    }
    try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {}
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      finish('');
    }, 12000);
    child.on('exit', () => {
      clearTimeout(timer);
      try {
        finish(fs.existsSync(outFile) && fs.statSync(outFile).size > 512 ? `/media-thumb/${outName}` : '');
      } catch {
        finish('');
      }
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      console.warn('[WIVA] thumbnail generation failed:', path.basename(file), error.message);
      finish('');
    });
  });
}

async function fileSignature(file, stat, remoteUrl = '') {
  const parts = ['art-v3', String(stat.size || 0), String(Math.trunc(stat.mtimeMs || 0)), String(remoteUrl || '')];
  const baseNoExt = file.replace(/\.[^.]+$/, '');
  for (const ext of SUB_EXT) {
    try {
      const sub = await fs.promises.stat(baseNoExt + ext);
      parts.push(ext, String(sub.size || 0), String(Math.trunc(sub.mtimeMs || 0)));
    } catch {}
  }
  return parts.join(':');
}

async function hasLocalArtwork(file, directoryCache) {
  try {
    const dir = path.dirname(file);
    if (directoryCache?.has(dir)) return directoryCache.get(dir);
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const found = entries.some((entry) => entry.isFile() && ARTWORK_EXT.has(path.extname(entry.name).toLowerCase()));
    directoryCache?.set(dir, found);
    return found;
  } catch {
    return false;
  }
}

let activeScanPromise = null;
let queuedScan = null;

async function performScanAll({ tmdbKey, tmdbLang = 'ar', thumbnailDir = '', sourceId = null, force = false } = {}, onProgress) {
  const paths = db.listPaths().filter((source) => !sourceId || String(source.id) === String(sourceId));
  const existingByPath = new Map(db.listMedia({ limit: 100000 }).map((item) => [String(item.path), item]));
  const localArtworkByDirectory = new Map();
  const report = {
    total: 0,
    done: 0,
    addedOrUpdated: 0,
    unchanged: 0,
    books: 0,
    documents: 0,
    removedMissing: 0,
    unsupported: 0,
    disconnectedSources: [],
    permissionErrors: [],
    sources: [],
  };
  if (onProgress) onProgress({ stage: 'reading_sources', done: 0, total: paths.length, message: 'جاري قراءة مصادر المكتبة' });
  for (const lp of paths) {
    const label = sourceLabel(lp);
    const readable = sourceReadable(lp.path);
    if (!readable.ok) {
      db.updatePathStatus(lp.id, {
        status: readable.status,
        lastScanAt: lp.last_scan_at || null,
        lastError: readable.message,
        fileCount: Number(lp.file_count || 0),
        folderCount: Number(lp.folder_count || 0),
        label,
      });
      report.disconnectedSources.push({ id: lp.id, label, path: lp.path, status: readable.status, message: readable.message });
      if (onProgress) onProgress({ stage: 'source_unavailable', sourceId: lp.id, source: label, message: readable.message });
      continue;
    }
    db.updatePathStatus(lp.id, { status: 'scanning', lastError: '', fileCount: Number(lp.file_count || 0), folderCount: Number(lp.folder_count || 0), label });
    const walkReport = { folderCount: 0, permissionErrors: [] };
    const isExcluded = excludeMatcher(lp);
    const files = await walk(lp.path, [], walkReport, { isExcluded });
    report.permissionErrors.push(...walkReport.permissionErrors);
    const allFiles = [];
    for (const f of files) {
      const ext = path.extname(f).toLowerCase();
      const relPath = path.relative(lp.path, f);
      const relDir = path.dirname(relPath);
      if (path.basename(f).toLowerCase() === URL_FILE) {
        const remoteUrl = readUrlFile(f);
        if (remoteUrl) allFiles.push({ file: f, remoteUrl, libKind: lp.kind, mediaKind: 'video', root: lp.path, source: lp, sourceLabel: label, relPath, relDir });
        continue;
      }
      if (VIDEO_EXT.has(ext) || AUDIO_EXT.has(ext) || BOOK_EXT.has(ext) || DOCUMENT_EXT.has(ext)) {
        const mediaKind = AUDIO_EXT.has(ext) ? 'audio' : BOOK_EXT.has(ext) ? 'book' : DOCUMENT_EXT.has(ext) ? 'document' : 'video';
        allFiles.push({ file: f, libKind: lp.kind, mediaKind, root: lp.path, source: lp, sourceLabel: label, relPath, relDir });
      }
      else if (!SUB_EXT.has(ext)) report.unsupported += 1;
    }
    const seenMedia = [];
    const pendingMedia = [];
    const artworkQueue = [];
    let done = 0;
    report.total += allFiles.length;
    if (onProgress) onProgress({ stage: 'scanning_source', sourceId: lp.id, source: label, done: 0, total: allFiles.length, message: 'جاري فحص ' + label });
    for (const { file, remoteUrl, libKind, mediaKind, source, sourceLabel: labelText, relPath, relDir } of allFiles) {
      try {
        const stat = await fs.promises.stat(file);
        const signature = await fileSignature(file, stat, remoteUrl);
        const meta = parseName(path.basename(file));
        const playablePath = remoteUrl || file;
        const existing = existingByPath.get(String(playablePath));
        if (!force && existing?.file_signature && existing.file_signature === signature) {
          seenMedia.push(playablePath);
          report.unchanged += 1;
          if (existing.kind === 'book') report.books += 1;
          if (existing.kind === 'document') report.documents += 1;
          done++;
          report.done += 1;
          if (onProgress) onProgress({ stage: 'scanning_source', sourceId: lp.id, source: label, done, total: allFiles.length, unchanged: report.unchanged });
          continue;
        }
        const folder = relDir && relDir !== '.' ? relDir : '';
        const item = {
          path: playablePath,
          kind: mediaKind === 'audio' ? 'audio'
            : mediaKind === 'book' ? 'book'
              : mediaKind === 'document' ? 'document'
                : (meta.kind === 'episode' ? 'episode' : (libKind === 'tv' ? 'episode' : 'movie')),
          title: meta.title,
          year: meta.year || null,
          season: meta.season || null,
          episode: meta.episode || null,
          size: remoteUrl ? 0 : stat.size,
          section: labelText,
          folder,
          remote_url: remoteUrl || null,
          source_id: source.id,
          source_path: source.path,
          source_label: labelText,
          relative_path: relPath,
          modified_at: Math.trunc(stat.mtimeMs || 0),
          file_signature: signature,
        };
        if (existing) {
          item.tmdb_id = existing.tmdb_id || null;
          const storedPoster = validStoredArtwork(existing.poster_url, thumbnailDir) || '';
          const storedBackdrop = validStoredArtwork(existing.backdrop_url, thumbnailDir) || '';
          const storedGenerated = /^\/media-thumb\//i.test(storedPoster || storedBackdrop);
          item.poster_url = storedGenerated ? (storedPoster || storedBackdrop) : null;
          item.backdrop_url = storedGenerated ? (storedBackdrop || storedPoster) : null;
          item.fallback_poster_url = storedGenerated ? null : (storedPoster || null);
          item.fallback_backdrop_url = storedGenerated ? null : (storedBackdrop || null);
          item.overview = existing.overview || null;
          item.rating = existing.rating || null;
          item.duration = existing.duration || null;
        }
        const localArtwork = !remoteUrl && await hasLocalArtwork(file, localArtworkByDirectory);
        const needsArtwork = !localArtwork && mediaKind === 'video' && !remoteUrl && !item.poster_url && !item.backdrop_url;
        if (!item.poster_url && !item.backdrop_url && (item.fallback_poster_url || item.fallback_backdrop_url)) {
          item.poster_url = item.fallback_poster_url || item.fallback_backdrop_url;
          item.backdrop_url = item.fallback_backdrop_url || item.fallback_poster_url;
        }
        if (needsArtwork) artworkQueue.push({ item, file, folder, meta });
        delete item.fallback_poster_url;
        delete item.fallback_backdrop_url;
        const baseNoExt = file.replace(/\.[^.]+$/, '');
        const subtitles = [];
        for (const sx of SUB_EXT) {
          const subPath = baseNoExt + sx;
          if (fs.existsSync(subPath)) subtitles.push(subPath);
        }
        pendingMedia.push({ item, subtitles });
        seenMedia.push(playablePath);
        report.addedOrUpdated += 1;
        if (item.kind === 'book') report.books += 1;
        if (item.kind === 'document') report.documents += 1;
      } catch (e) {
        report.permissionErrors.push({ path: file, error: e.message });
      }
      done++;
      report.done += 1;
      if (onProgress) onProgress({ stage: 'scanning_source', sourceId: lp.id, source: label, done, total: allFiles.length });
    }
    if (pendingMedia.length) {
      if (onProgress) onProgress({ stage: 'saving_index', sourceId: lp.id, source: label, done: pendingMedia.length, total: pendingMedia.length, message: 'جاري حفظ فهرس ' + label });
      const ids = db.upsertMediaBatch(pendingMedia.map((entry) => entry.item));
      pendingMedia.forEach((entry, index) => {
        for (const subPath of entry.subtitles) {
          try { db.addSubtitle(ids[index], 'auto', subPath, path.basename(subPath)); } catch {}
        }
      });
    }
    report.removedMissing += Number(db.deleteMissingForSource(lp.id, seenMedia) || 0);
    db.updatePathStatus(lp.id, {
      status: 'connected',
      lastError: '',
      fileCount: seenMedia.length,
      folderCount: walkReport.folderCount,
      label,
    });
    report.sources.push({ id: lp.id, label, path: lp.path, fileCount: seenMedia.length, folderCount: walkReport.folderCount });
    if (onProgress) onProgress({ stage: 'source_indexed', sourceId: lp.id, source: label, done: report.done, total: report.total, message: 'أصبح محتوى ' + label + ' متاحًا، وجاري تحسين الصور في الخلفية' });
    for (let index = 0; index < artworkQueue.length; index += 1) {
      const { item, file, folder, meta } = artworkQueue[index];
      const fallbackPoster = item.poster_url || '';
      const fallbackBackdrop = item.backdrop_url || '';
      item.poster_url = null;
      item.backdrop_url = null;
      const thumb = await generateVideoThumbnail(file, thumbnailDir);
      if (thumb) {
        item.poster_url = thumb;
        item.backdrop_url = thumb;
      } else if (tmdbKey) {
        for (const candidate of metadataCandidates(item, folder, meta)) {
          try {
            const info = await tmdb.search(tmdbKey, candidate.title, candidate.year, item.kind, tmdbLang);
            if (info) {
              item.tmdb_id = info.id;
              item.poster_url = info.poster;
              item.backdrop_url = info.backdrop;
              item.overview = info.overview;
              item.rating = info.rating;
              break;
            }
          } catch {
            break;
          }
        }
      }
      if (!item.poster_url && !item.backdrop_url) {
        item.poster_url = fallbackPoster || null;
        item.backdrop_url = fallbackBackdrop || fallbackPoster || null;
        if (!item.poster_url && !item.backdrop_url) item.file_signature += ':art-pending';
      }
      db.upsertMedia(item);
      if (onProgress && (index % 5 === 0 || index === artworkQueue.length - 1)) {
        onProgress({
          stage: 'enriching_artwork', sourceId: lp.id, source: label,
          done: report.done, total: report.total,
          artworkDone: index + 1, artworkTotal: artworkQueue.length,
          message: `جاري تحسين الصور ${index + 1} من ${artworkQueue.length}`,
        });
      }
    }
    if (onProgress) onProgress({ stage: 'source_complete', sourceId: lp.id, source: label, done: seenMedia.length, total: seenMedia.length, message: 'أصبح محتوى ' + label + ' متاحًا' });
  }
  if (onProgress) onProgress({ stage: 'done', done: report.done, total: report.total, message: 'اكتمل فحص المكتبة' });
  return report;
}

function scanAll(options = {}, onProgress) {
  if (activeScanPromise) {
    queuedScan = { options, onProgress };
    return activeScanPromise;
  }
  activeScanPromise = (async () => {
    let result = await performScanAll(options, onProgress);
    while (queuedScan) {
      const next = queuedScan;
      queuedScan = null;
      result = await performScanAll(next.options, next.onProgress);
    }
    return result;
  })().finally(() => {
    activeScanPromise = null;
  });
  return activeScanPromise;
}

module.exports = { scanAll, parseName, VIDEO_EXT, AUDIO_EXT, BOOK_EXT, DOCUMENT_EXT };
