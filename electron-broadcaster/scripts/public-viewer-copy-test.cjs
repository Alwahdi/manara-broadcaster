const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'webui', 'src');
const publicFiles = [
  path.join(root, 'components', 'ViewerLayout.tsx'),
  path.join(root, 'components', 'OfflineBanner.tsx'),
  path.join(root, 'components', 'States.tsx'),
  path.join(root, 'components', 'LiveIndicator.tsx'),
  path.join(root, 'components', 'common.tsx'),
  path.join(root, 'screens', 'viewer'),
];

const forbidden = [
  /server/i,
  /backend/i,
  /dashboard/i,
  /\bAPI\b/,
  /\bHLS\b/i,
  /\bWebRTC\b/i,
  /\bproxy\b/i,
  /\bupstream\b/i,
  /source path/i,
  /storage source/i,
  /\bscan\b/i,
  /\bagent\b/i,
  /\bElectron\b/i,
  /local service/i,
  /جهاز السيرفر/,
  /لوحة الإدارة/,
  /المشرف/,
  /مصدر التخزين/,
  /مصدر البث/,
  /ملفاتك كما هي/,
  /بنية الملفات/,
  /أعد فحص/,
  /أضف مسار/,
  /شغّل المصدر/,
  /غير مفهرس/,
  /provider unavailable/i,
  /سيرفر/,
  /مصدر/,
  /مسار/,
  /مكتبة/,
  /فحص/,
  /رقم الغرفة/,
  /تخزين/,
  /\bIPTV\b/i,
  /\bLIVE\b/,
  /📡|📂|⭐|🎬|🗂️|⚠️/,
];

const internalLiteralPatterns = [
  /^[@./#]/,
  /^[a-z0-9_.:/?=&${}()[\]\-]+$/i,
  /^(all|folder|media|sports|news|movies|kids|fit|fill|zoom|home|live|library|search|user)$/i,
  /^(viewer-state|agent-state|library|library-browse|media|search-root|true|false|auto|none)$/i,
  /application\/vnd\.apple\.mpegurl/i,
  /data-wiva-hls/i,
  /hls\.min\.js/i,
];

function filesFrom(entry) {
  const stat = fs.statSync(entry);
  if (stat.isDirectory()) {
    return fs.readdirSync(entry)
      .flatMap((child) => filesFrom(path.join(entry, child)));
  }
  return /\.(tsx?|jsx?)$/.test(entry) ? [entry] : [];
}

function extractQuotedStrings(content) {
  const values = [];
  const re = /(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let match;
  while ((match = re.exec(content))) {
    values.push(match[2].replace(/\\n/g, ' ').trim());
  }
  return values.filter(Boolean);
}

function extractJsxText(content) {
  const values = [];
  const re = />\s*([^<>{}]+?)\s*</g;
  let match;
  while ((match = re.exec(content))) {
    const text = match[1].replace(/\s+/g, ' ').trim();
    if (text) values.push(text);
  }
  return values.filter((line) => /[\u0600-\u06ffA-Z]/.test(line));
}

const failures = [];
for (const file of publicFiles.flatMap(filesFrom)) {
  const content = fs.readFileSync(file, 'utf8');
  const relative = path.relative(path.join(__dirname, '..'), file);
  const visibleCandidates = [
    ...extractQuotedStrings(content).filter((value) => (
      /[\u0600-\u06ff]/.test(value)
      || /\b(LIVE|IPTV|HLS|WebRTC|server|admin|dashboard|proxy|upstream|provider)\b/i.test(value)
    )),
    ...extractJsxText(content),
  ].filter((value) => !internalLiteralPatterns.some((pattern) => pattern.test(value)));

  for (const value of visibleCandidates) {
    const hit = forbidden.find((pattern) => pattern.test(value));
    if (hit) failures.push(`${relative}: "${value}" matched ${hit}`);
  }
}

assert.deepEqual(failures, [], `Public viewer copy leaks subscriber-forbidden wording:\n${failures.join('\n')}`);
console.log('WIVA public viewer copy test passed');
