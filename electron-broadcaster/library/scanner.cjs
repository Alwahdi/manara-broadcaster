// WIVA — filesystem scanner for media library
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const db = require('./db.cjs');
const tmdb = require('./tmdb.cjs');

const VIDEO_EXT = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.ts', '.flv', '.wmv']);
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.aac', '.wma', '.opus']);
const SUB_EXT = new Set(['.srt', '.vtt', '.ass']);
const URL_FILE = 'url.txt';

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

function walk(dir, out = [], report = { folderCount: 0, permissionErrors: [] }) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) {
    report.permissionErrors.push({ path: dir, error: e.message });
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      report.folderCount += 1;
      walk(full, out, report);
    }
    else if (e.isFile()) out.push(full);
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
    const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
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
        '-vf', 'scale=640:-1',
        '-q:v', '5',
        outFile,
      ], { stdio: 'ignore', windowsHide: true });
    } catch {
      finish('');
      return;
    }
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
    child.on('error', () => {
      clearTimeout(timer);
      finish('');
    });
  });
}

async function scanAll({ tmdbKey, tmdbLang = 'ar', thumbnailDir = '' } = {}, onProgress) {
  const paths = db.listPaths();
  const report = {
    total: 0,
    done: 0,
    addedOrUpdated: 0,
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
    const files = walk(lp.path, [], walkReport);
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
      if (VIDEO_EXT.has(ext) || AUDIO_EXT.has(ext)) allFiles.push({ file: f, libKind: lp.kind, mediaKind: AUDIO_EXT.has(ext) ? 'audio' : 'video', root: lp.path, source: lp, sourceLabel: label, relPath, relDir });
      else if (!SUB_EXT.has(ext)) report.unsupported += 1;
    }
    const seenMedia = [];
    let done = 0;
    report.total += allFiles.length;
    if (onProgress) onProgress({ stage: 'scanning_source', sourceId: lp.id, source: label, done: 0, total: allFiles.length, message: 'جاري فحص ' + label });
    for (const { file, remoteUrl, libKind, mediaKind, source, sourceLabel: labelText, relPath, relDir } of allFiles) {
      try {
        const stat = fs.statSync(file);
        const meta = parseName(path.basename(file));
        const playablePath = remoteUrl || file;
        const folder = relDir && relDir !== '.' ? relDir : '';
        const item = {
          path: playablePath,
          kind: mediaKind === 'audio' ? 'audio' : (meta.kind === 'episode' ? 'episode' : (libKind === 'tv' ? 'episode' : 'movie')),
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
        };
        if (tmdbKey) {
          try {
            const info = await tmdb.search(tmdbKey, item.title, item.year, item.kind, tmdbLang);
            if (info) {
              item.tmdb_id = info.id;
              item.poster_url = info.poster;
              item.backdrop_url = info.backdrop;
              item.overview = info.overview;
              item.rating = info.rating;
            }
          } catch { /* ignore TMDB errors per-item */ }
        }
        if (!item.poster_url && !item.backdrop_url && mediaKind === 'video' && !remoteUrl) {
          const thumb = await generateVideoThumbnail(file, thumbnailDir);
          if (thumb) {
            item.poster_url = thumb;
            item.backdrop_url = thumb;
          }
        }
        const id = db.upsertMedia(item);
        const baseNoExt = file.replace(/\.[^.]+$/, '');
        for (const sx of SUB_EXT) {
          const subPath = baseNoExt + sx;
          if (fs.existsSync(subPath)) {
            try { db.addSubtitle(id, 'auto', subPath, path.basename(subPath)); } catch {}
          }
        }
        seenMedia.push(playablePath);
        report.addedOrUpdated += 1;
      } catch (e) {
        report.permissionErrors.push({ path: file, error: e.message });
      }
      done++;
      report.done += 1;
      if (onProgress) onProgress({ stage: 'scanning_source', sourceId: lp.id, source: label, done, total: allFiles.length });
    }
    db.deleteMissingForSource(lp.id, seenMedia);
    db.updatePathStatus(lp.id, {
      status: 'connected',
      lastError: '',
      fileCount: seenMedia.length,
      folderCount: walkReport.folderCount,
      label,
    });
    report.sources.push({ id: lp.id, label, path: lp.path, fileCount: seenMedia.length, folderCount: walkReport.folderCount });
  }
  if (onProgress) onProgress({ stage: 'done', done: report.done, total: report.total, message: 'اكتمل فحص المكتبة' });
  return report;
}

module.exports = { scanAll, parseName };
