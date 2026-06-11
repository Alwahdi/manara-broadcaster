// Manara — filesystem scanner for media library
const fs = require('fs');
const path = require('path');
const db = require('./db.cjs');
const tmdb = require('./tmdb.cjs');

const VIDEO_EXT = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.ts', '.flv', '.wmv']);
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.aac', '.wma', '.opus']);
const SUB_EXT = new Set(['.srt', '.vtt', '.ass']);

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

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile()) out.push(full);
  }
  return out;
}

async function scanAll({ tmdbKey, tmdbLang = 'ar' } = {}, onProgress) {
  const paths = db.listPaths();
  const seenMedia = [];
  let total = 0, done = 0;
  const allFiles = [];
  for (const lp of paths) {
    const files = walk(lp.path);
    for (const f of files) {
      const ext = path.extname(f).toLowerCase();
      if (VIDEO_EXT.has(ext) || AUDIO_EXT.has(ext)) allFiles.push({ file: f, libKind: lp.kind, mediaKind: AUDIO_EXT.has(ext) ? 'audio' : 'video' });
    }
  }
  total = allFiles.length;
  for (const { file, libKind, mediaKind } of allFiles) {
    try {
      const stat = fs.statSync(file);
      const meta = parseName(path.basename(file));
      const item = {
        path: file,
        kind: mediaKind === 'audio' ? 'audio' : (meta.kind === 'episode' ? 'episode' : (libKind === 'tv' ? 'episode' : 'movie')),
        title: meta.title,
        year: meta.year || null,
        season: meta.season || null,
        episode: meta.episode || null,
        size: stat.size,
      };
      // TMDB lookup
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
      const id = db.upsertMedia(item);
      // sidecar subtitle
      const baseNoExt = file.replace(/\.[^.]+$/, '');
      for (const sx of SUB_EXT) {
        const subPath = baseNoExt + sx;
        if (fs.existsSync(subPath)) {
          try { db.addSubtitle(id, 'auto', subPath, path.basename(subPath)); } catch {}
        }
      }
      seenMedia.push(file);
    } catch (e) { /* skip bad file */ }
    done++;
    if (onProgress) onProgress({ done, total });
  }
  db.deleteMissing(seenMedia);
  return { total, done };
}

module.exports = { scanAll, parseName };
