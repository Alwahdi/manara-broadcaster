const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const db = require('../library/db.cjs');
const scanner = require('../library/scanner.cjs');
const mediaServer = require('../library/media-server.cjs');

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiva-folder-art-'));
  const localFolder = path.join(dir, 'Local Cover Movie');
  const tmdbFolder = path.join(dir, 'TMDB Movie');
  const thumbFolder = path.join(dir, 'Generated Thumbnail Movie');
  const extractedFolder = path.join(dir, 'Extracted Frame Movie');
  for (const folder of [localFolder, tmdbFolder, thumbFolder, extractedFolder]) fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(localFolder, 'movie.mp4'), Buffer.alloc(1024));
  fs.writeFileSync(path.join(localFolder, 'cover.jpg'), Buffer.from('folder-cover'));
  fs.writeFileSync(path.join(tmdbFolder, 'movie.mp4'), Buffer.alloc(1024));
  fs.writeFileSync(path.join(thumbFolder, 'movie.mp4'), Buffer.alloc(1024));
  const ffmpeg = require('@ffmpeg-installer/ffmpeg').path;
  execFileSync(ffmpeg, [
    '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:d=5',
    '-c:v', 'mpeg4', '-pix_fmt', 'yuv420p', path.join(extractedFolder, 'movie.mp4'),
  ], { stdio: 'ignore' });

  db.init(path.join(dir, 'library.db'), { broadcast: [], iptv: [] });
  db.addPath(dir, 'movies');
  const source = db.listPaths()[0];
  const thumbnailDir = path.join(dir, 'thumbnails');
  await scanner.scanAll({ thumbnailDir });

  db.upsertMedia({
    path: path.join(tmdbFolder, 'movie.mp4'),
    kind: 'movie',
    title: 'TMDB Movie',
    source_id: source.id,
    source_path: dir,
    source_label: source.label,
    relative_path: 'TMDB Movie/movie.mp4',
    folder: 'TMDB Movie',
    poster_url: 'https://image.tmdb.org/t/p/w500/example.jpg',
  });
  db.upsertMedia({
    path: path.join(thumbFolder, 'movie.mp4'),
    kind: 'movie',
    title: 'Generated Thumbnail Movie',
    source_id: source.id,
    source_path: dir,
    source_label: source.label,
    relative_path: 'Generated Thumbnail Movie/movie.mp4',
    folder: 'Generated Thumbnail Movie',
    poster_url: '/media-thumb/0123456789012345678901234567890123456789.jpg',
  });

  const server = http.createServer(mediaServer.createHandler({
    getPlatformStatus: () => ({ state: 'active', features: { media: true } }),
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${base}/api/library/browse`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    const byName = new Map(payload.entries.map((entry) => [entry.name, entry]));
    assert.match(byName.get('Local Cover Movie').cover, /^\/folder-art\//);
    assert.equal(byName.get('TMDB Movie').cover, 'https://image.tmdb.org/t/p/w500/example.jpg');
    assert.equal(byName.get('Generated Thumbnail Movie').cover, '/media-thumb/0123456789012345678901234567890123456789.jpg');
    assert.match(byName.get('Extracted Frame Movie').cover, /^\/media-thumb\/[a-f0-9]{40}\.jpg$/);
    assert.ok(fs.readdirSync(thumbnailDir).some((name) => /^[a-f0-9]{40}\.jpg$/.test(name)));

    const coverResponse = await fetch(base + byName.get('Local Cover Movie').cover);
    assert.equal(coverResponse.status, 200);
    assert.equal(Buffer.from(await coverResponse.arrayBuffer()).toString(), 'folder-cover');
    console.log('WIVA folder artwork cascade tests passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
