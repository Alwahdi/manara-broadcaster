// WIVA — TMDB metadata lookup (no extra deps; uses fetch)
const IMG = 'https://image.tmdb.org/t/p/w500';
const IMG_BIG = 'https://image.tmdb.org/t/p/w1280';
const CACHE = new Map();
const CACHE_MAX = 2000;
const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 60 * 60 * 1000;

function cacheKey(title, year, kind, lang) {
  return [String(title || '').trim().toLowerCase(), year || '', kind || '', lang || 'ar'].join('|');
}

function remember(key, value) {
  CACHE.delete(key);
  CACHE.set(key, { value, expiresAt: Date.now() + (value ? SUCCESS_TTL_MS : MISS_TTL_MS) });
  while (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
  return value;
}

async function search(apiKey, title, year, kind, lang = 'ar') {
  const key = cacheKey(title, year, kind, lang);
  const cached = CACHE.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const isTv = kind === 'episode' || kind === 'tv';
  const endpoint = isTv ? 'tv' : 'movie';
  const url = new URL(`https://api.themoviedb.org/3/search/${endpoint}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('language', lang);
  url.searchParams.set('query', title);
  if (year) url.searchParams.set(isTv ? 'first_air_date_year' : 'year', String(year));
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return remember(key, null);
  const j = await res.json();
  const r = (j.results || [])[0];
  if (!r) return remember(key, null);
  return remember(key, {
    id: r.id,
    poster: r.poster_path ? IMG + r.poster_path : null,
    backdrop: r.backdrop_path ? IMG_BIG + r.backdrop_path : null,
    overview: r.overview || '',
    rating: r.vote_average || 0,
  });
}

module.exports = { search };
