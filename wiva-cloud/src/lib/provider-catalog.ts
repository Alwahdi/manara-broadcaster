import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { decryptCredentials } from "@/lib/crypto";
import { getProviderSecret } from "@/lib/db";
import { HttpError } from "@/lib/security";
import { prepareCatalogItem } from "@/lib/catalog-safety";
import type { AssetKind, ProviderCatalogCategory, ProviderCatalogItem, ProviderSeriesEpisode, ProviderSummary } from "@/lib/types";

type ProviderConnection = {
  id: string;
  name: string;
  kind: ProviderSummary["kind"];
  status: ProviderSummary["status"];
  rightsReference: string;
  credentials: { baseUrl?: string; username?: string; password?: string; allowInsecureHttp?: string };
};

const cache = new Map<string, { expiresAt: number; items: ProviderCatalogItem[] }>();
const MAX_CATALOG_BYTES = 48_000_000;
const MAX_CACHED_CATALOGS = 12;
const SECTION_CONFIG = {
  live: { categories: "get_live_categories", items: "get_live_streams", id: "stream_id", prefix: "live" },
  movie: { categories: "get_vod_categories", items: "get_vod_streams", id: "stream_id", prefix: "vod" },
  series: { categories: "get_series_categories", items: "get_series", id: "series_id", prefix: "series" },
} as const;

function privateIp(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const [a, b] = [Number(match[1]), Number(match[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertSafeProviderUrl(value: string, allowInsecureHttp = false) {
  let url: URL;
  try { url = new URL(value); } catch { throw new HttpError(400, "عنوان المزوّد غير صالح"); }
  const allowedProtocol = url.protocol === "https:" || (url.protocol === "http:" && allowInsecureHttp && process.env.WIVA_ALLOW_INSECURE_PROVIDER_HTTP === "true");
  if (!allowedProtocol || url.username || url.password) throw new HttpError(400, "بروتوكول رابط المزوّد غير مسموح");
  if (url.hostname === "localhost" || (isIP(url.hostname) && privateIp(url.hostname))) throw new HttpError(400, "لا يمكن فحص عنوان محلي أو خاص");
  try {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => privateIp(entry.address))) throw new HttpError(400, "عنوان المزوّد يشير إلى شبكة خاصة");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "تعذر الوصول إلى اسم خادم المزوّد");
  }
  return url;
}

async function readLimited(response: Response, maxBytes: number) {
  if (!response.ok) throw new HttpError(502, `رفض المزوّد طلب الفهرسة (${response.status})`);
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new HttpError(413, "فهرس المزوّد أكبر من الحد الآمن");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new HttpError(413, "فهرس المزوّد أكبر من الحد الآمن"); }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

async function providerFetch(url: URL, maxBytes = MAX_CATALOG_BYTES, allowInsecureHttp = false, timeoutMs = 180_000) {
  await assertSafeProviderUrl(url.toString(), allowInsecureHttp);
  const response = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json, application/x-mpegURL, text/plain;q=0.8", "user-agent": "WIVA-Catalog/1.0" },
    signal: AbortSignal.timeout(timeoutMs),
  }).catch(() => { throw new HttpError(502, "تعذر الاتصال بالمزوّد خلال المهلة المحددة"); });
  try { return await readLimited(response, maxBytes); }
  catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(504, "استغرق تنزيل فهرس المزوّد وقتًا أطول من الحد المسموح");
  }
}

function safeArtworkUrl(value: unknown) {
  if (!value) return "";
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:" || url.username || url.password) return "";
    for (const key of ["username", "password", "token", "auth", "key"]) url.searchParams.delete(key);
    return url.toString().slice(0, 1000);
  } catch { return ""; }
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function xtreamUrl(connection: ProviderConnection, action: string, params: Record<string, string> = {}) {
  const base = connection.credentials.baseUrl || "";
  // Xtream's API is normally rooted at the host even when the supplied portal
  // or playlist URL contains an additional path such as /c/ or /get.php.
  const url = new URL("/player_api.php", base);
  url.searchParams.set("username", connection.credentials.username || "");
  url.searchParams.set("password", connection.credentials.password || "");
  url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

export async function discoverSeriesEpisodes(connection: ProviderConnection, seriesRef: string): Promise<ProviderSeriesEpisode[]> {
  const match = seriesRef.match(/^xtream:series:(\d+)$/);
  if (!match || connection.kind === "licensed_hls") throw new HttpError(400, "مرجع المسلسل غير صالح");
  const allowInsecureHttp = connection.credentials.allowInsecureHttp === "true";
  const text = await providerFetch(xtreamUrl(connection, "get_series_info", { series_id: match[1] }), 16_000_000, allowInsecureHttp, 45_000);
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new HttpError(502, "أعاد المزوّد تفاصيل مسلسل غير صالحة"); }
  const data = raw as Record<string, unknown>;
  const groups = data?.episodes && typeof data.episodes === "object" ? Object.entries(data.episodes as Record<string, unknown>) : [];
  const episodes: ProviderSeriesEpisode[] = [];
  for (const [seasonKey, value] of groups) {
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      const row = entry as Record<string, unknown>; const id = String(row.id ?? "").trim();
      if (!/^\d+$/.test(id)) continue;
      const seasonNumber = Math.max(0, Number(row.season ?? seasonKey) || 0);
      const episodeNumber = Math.max(0, Number(row.episode_num) || 0);
      const extension = String(row.container_extension || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "mp4";
      const info = row.info && typeof row.info === "object" ? row.info as Record<string, unknown> : {};
      episodes.push({
        ref: `xtream:episode:${id}:${extension}`,
        title: String(row.title || `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`).slice(0, 180),
        seasonNumber, episodeNumber, containerExtension: extension,
        artworkUrl: safeArtworkUrl(info.movie_image),
        description: String(info.plot || "").trim().slice(0, 1200),
      });
    }
  }
  return episodes.sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
}

async function discoverXtream(connection: ProviderConnection, section: AssetKind) {
  const config = SECTION_CONFIG[section];
  const allowInsecureHttp = connection.credentials.allowInsecureHttp === "true";
  const [categoryText, itemText] = await Promise.all([
    providerFetch(xtreamUrl(connection, config.categories), 5_000_000, allowInsecureHttp),
    providerFetch(xtreamUrl(connection, config.items), MAX_CATALOG_BYTES, allowInsecureHttp),
  ]);
  let categoriesRaw: unknown; let itemsRaw: unknown;
  try { categoriesRaw = JSON.parse(categoryText); itemsRaw = JSON.parse(itemText); }
  catch { throw new HttpError(502, "أعاد المزوّد فهرسًا غير صالح"); }
  if (!Array.isArray(itemsRaw)) throw new HttpError(502, "لم يعُد المزوّد قائمة محتوى صالحة");
  const categories = new Map<string, string>();
  if (Array.isArray(categoriesRaw)) {
    for (const raw of categoriesRaw.slice(0, 20_000)) {
      const row = raw as Record<string, unknown>;
      categories.set(String(row.category_id ?? ""), String(row.category_name ?? "غير مصنف").slice(0, 120));
    }
  }
  return itemsRaw.slice(0, 50_000).flatMap((raw): ProviderCatalogItem[] => {
    const row = raw as Record<string, unknown>;
    const id = String(row[config.id] ?? "").trim();
    const title = String(row.name ?? row.title ?? "").trim().slice(0, 180);
    if (!id || !title) return [];
    const categoryId = String(row.category_id ?? "");
    const extension = section === "movie" ? (String(row.container_extension || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "mp4") : "";
    return [{
      ref: `xtream:${config.prefix}:${id}${extension ? `:${extension}` : ""}`,
      kind: section,
      title,
      categoryId,
      category: categories.get(categoryId) || "غير مصنف",
      artworkUrl: safeArtworkUrl(row.stream_icon ?? row.cover),
      description: String(row.plot ?? row.description ?? "").trim().slice(0, 1200),
      year: numberOrNull(row.year ?? row.releaseDate),
      rating: numberOrNull(row.rating_5based ?? row.rating),
      quality: /\b(4k|uhd)\b/i.test(title) ? "4K" : /\b(fhd|1080)\b/i.test(title) ? "FHD" : "HD",
      language: String(row.language ?? "").slice(0, 60),
    }];
  });
}

function inferM3uKind(group: string, title: string): AssetKind {
  const value = `${group} ${title}`.toLowerCase();
  if (/series|season|episode|مسلسل|مسلسلات/.test(value)) return "series";
  if (/vod|movie|film|cinema|فيلم|أفلام/.test(value)) return "movie";
  return "live";
}

export function parseM3u(text: string) {
  if (!text.trimStart().startsWith("#EXTM3U")) throw new HttpError(502, "الرابط لا يعيد قائمة M3U صالحة");
  const lines = text.split(/\r?\n/);
  const items: ProviderCatalogItem[] = [];
  let meta: { title: string; group: string; logo: string } | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("#EXTINF:")) {
      const attrs = new Map<string, string>();
      for (const match of line.matchAll(/([\w-]+)="([^"]*)"/g)) attrs.set(match[1], match[2]);
      meta = { title: (line.slice(line.lastIndexOf(",") + 1) || attrs.get("tvg-name") || "بدون اسم").slice(0, 180), group: (attrs.get("group-title") || "غير مصنف").slice(0, 120), logo: attrs.get("tvg-logo") || "" };
    } else if (meta && line && !line.startsWith("#")) {
      const ref = `m3u:${createHash("sha256").update(line).digest("hex").slice(0, 32)}`;
      items.push({ ref, kind: inferM3uKind(meta.group, meta.title), title: meta.title, categoryId: meta.group, category: meta.group, artworkUrl: safeArtworkUrl(meta.logo), description: "", year: null, rating: null, quality: /4k|uhd/i.test(meta.title) ? "4K" : /fhd|1080/i.test(meta.title) ? "FHD" : "HD", language: "" });
      meta = null;
      if (items.length >= 50_000) break;
    }
  }
  return items;
}

async function discoverM3u(connection: ProviderConnection) {
  const allowInsecureHttp = connection.credentials.allowInsecureHttp === "true";
  const url = await assertSafeProviderUrl(connection.credentials.baseUrl || "", allowInsecureHttp);
  if (connection.credentials.username && !url.searchParams.has("username")) url.searchParams.set("username", connection.credentials.username);
  if (connection.credentials.password && !url.searchParams.has("password")) url.searchParams.set("password", connection.credentials.password);
  return parseM3u(await providerFetch(url, MAX_CATALOG_BYTES, allowInsecureHttp));
}

export async function loadProviderConnection(id: string): Promise<ProviderConnection> {
  const row = await getProviderSecret(id);
  if (!row || !row.redistribution_attested) throw new HttpError(404, "المزوّد غير موجود أو غير مصرح بفهرسته");
  const credentials = decryptCredentials(String(row.credentials_cipher));
  return { id: String(row.id), name: String(row.name), kind: row.kind as ProviderSummary["kind"], status: row.status as ProviderSummary["status"], rightsReference: String(row.rights_reference), credentials };
}

export async function discoverProviderCatalog(connection: ProviderConnection, section: AssetKind, fresh = false) {
  const key = `${connection.id}:${section}`;
  const cached = cache.get(key);
  if (!fresh && cached && cached.expiresAt > Date.now()) return cached.items;
  const all = connection.kind === "licensed_hls" ? await discoverM3u(connection) : await discoverXtream(connection, section);
  const items = (connection.kind === "licensed_hls" ? all.filter((item) => item.kind === section) : all).map(prepareCatalogItem);
  if (!cache.has(key) && cache.size >= MAX_CACHED_CATALOGS) cache.delete(cache.keys().next().value!);
  cache.set(key, { expiresAt: Date.now() + 60_000, items });
  return items;
}

export function filterProviderCatalog(items: ProviderCatalogItem[], categoryId: string, search: string) {
  const query = search.trim().toLocaleLowerCase("ar");
  return items.filter((item) => (!categoryId || item.categoryId === categoryId) && (!query || `${item.title} ${item.category}`.toLocaleLowerCase("ar").includes(query)));
}

export function catalogCategories(items: ProviderCatalogItem[]): ProviderCatalogCategory[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const item of items) {
    const current = counts.get(item.categoryId) || { name: item.category || "غير مصنف", count: 0 };
    current.count += 1; counts.set(item.categoryId, current);
  }
  return [...counts.entries()].map(([id, value]) => ({ id, ...value })).sort((a, b) => a.name.localeCompare(b.name, "ar"));
}
