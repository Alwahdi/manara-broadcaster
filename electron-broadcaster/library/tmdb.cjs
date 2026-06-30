// WIVA — TMDB metadata lookup (no extra deps; uses fetch)
const IMG = 'https://image.tmdb.org/t/p/w500';
const IMG_BIG = 'https://image.tmdb.org/t/p/w1280';

async function search(apiKey, title, year, kind, lang = 'ar') {
  const isTv = kind === 'episode' || kind === 'tv';
  const endpoint = isTv ? 'tv' : 'movie';
  const url = new URL(`https://api.themoviedb.org/3/search/${endpoint}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('language', lang);
  url.searchParams.set('query', title);
  if (year) url.searchParams.set(isTv ? 'first_air_date_year' : 'year', String(year));
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const j = await res.json();
  const r = (j.results || [])[0];
  if (!r) return null;
  return {
    id: r.id,
    poster: r.poster_path ? IMG + r.poster_path : null,
    backdrop: r.backdrop_path ? IMG_BIG + r.backdrop_path : null,
    overview: r.overview || '',
    rating: r.vote_average || 0,
  };
}

module.exports = { search };
