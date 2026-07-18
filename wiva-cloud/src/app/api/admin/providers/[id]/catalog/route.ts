import { revalidateTag } from "next/cache";
import { requireAdminRequest } from "@/lib/auth";
import { audit, importProviderAssets, importProviderSeries } from "@/lib/db";
import { catalogCategories, discoverProviderCatalog, discoverSeriesEpisodes, filterProviderCatalog, loadProviderConnection } from "@/lib/provider-catalog";
import { assertSameOrigin, cleanText, errorResponse, HttpError, jsonBody } from "@/lib/security";
import type { AssetKind } from "@/lib/types";

export const runtime = "nodejs";
const sections = new Set<AssetKind>(["live", "movie", "series"]);

function sectionFrom(value: unknown) {
  const section = cleanText(value, 12) as AssetKind;
  if (!sections.has(section)) throw new HttpError(400, "نوع المحتوى غير صالح");
  return section;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireAdminRequest(request);
    const { id } = await params;
    const url = new URL(request.url);
    const section = sectionFrom(url.searchParams.get("section") || "live");
    const categoryId = cleanText(url.searchParams.get("category"), 160);
    const search = cleanText(url.searchParams.get("q"), 160);
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const limit = Math.max(12, Math.min(120, Number(url.searchParams.get("limit")) || 60));
    const connection = await loadProviderConnection(id);
    const seriesRef = cleanText(url.searchParams.get("seriesRef"), 180);
    if (section === "series" && seriesRef) {
      const episodes = await discoverSeriesEpisodes(connection, seriesRef);
      return Response.json({ ok: true, episodes }, { headers: { "cache-control": "no-store" } });
    }
    const all = await discoverProviderCatalog(connection, section, url.searchParams.get("fresh") === "true");
    const filtered = filterProviderCatalog(all, categoryId, search);
    const start = (page - 1) * limit;
    return Response.json({
      ok: true,
      provider: { id: connection.id, name: connection.name, kind: connection.kind, status: connection.status },
      section,
      categories: catalogCategories(all),
      items: filtered.slice(start, start + limit),
      page,
      limit,
      total: filtered.length,
      totalUnfiltered: all.length,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); requireAdminRequest(request);
    const { id } = await params;
    const body = await jsonBody<{ section?: unknown; categoryId?: unknown; q?: unknown; refs?: unknown; allFiltered?: unknown; active?: unknown; seriesRef?: unknown; episodeRefs?: unknown }>(request, 120_000);
    const section = sectionFrom(body.section || "live");
    const categoryId = cleanText(body.categoryId, 160);
    const search = cleanText(body.q, 160);
    const active = body.active === true;
    const connection = await loadProviderConnection(id);
    if (active && connection.status !== "active") throw new HttpError(409, "فعّل المزوّد أولًا قبل النشر للمشاهدين");
    const discovered = filterProviderCatalog(await discoverProviderCatalog(connection, section), categoryId, search);
    if (section === "series" && body.seriesRef) {
      const seriesRef = cleanText(body.seriesRef, 180);
      const series = discovered.find((item) => item.ref === seriesRef);
      if (!series) throw new HttpError(400, "المسلسل المحدد لم يعد موجودًا في النتائج");
      if (!Array.isArray(body.episodeRefs) || !body.episodeRefs.length || body.episodeRefs.length > 500) throw new HttpError(400, "اختر من حلقة واحدة إلى 500 حلقة");
      const available = await discoverSeriesEpisodes(connection, seriesRef);
      const wanted = new Set(body.episodeRefs.map((value) => cleanText(value, 180)));
      const episodes = available.filter((episode) => wanted.has(episode.ref));
      if (episodes.length !== wanted.size) throw new HttpError(400, "بعض الحلقات لم تعد موجودة لدى المزوّد");
      const result = await importProviderSeries(id, series, episodes, active);
      await audit("provider.series.import", "provider", id, { seriesRef, episodes: result.imported, active });
      revalidateTag("wiva-viewer-catalog", { expire: 0 });
      return Response.json({ ok: true, imported: result.imported, parentId: result.parentId, active }, { status: 201, headers: { "cache-control": "no-store" } });
    }
    if (section === "series") throw new HttpError(400, "افتح المسلسل واختر الحلقات التي تريد استيرادها");
    let selected;
    if (body.allFiltered === true) {
      if (discovered.length > 1000) throw new HttpError(413, "القسم يحوي أكثر من 1000 عنصر؛ اختر تصنيفًا أدق أو استورد عناصر محددة");
      selected = discovered;
    } else {
      if (!Array.isArray(body.refs) || !body.refs.length || body.refs.length > 500) throw new HttpError(400, "اختر من عنصر واحد إلى 500 عنصر");
      const wanted = new Set(body.refs.map((value) => cleanText(value, 160)));
      selected = discovered.filter((item) => wanted.has(item.ref));
      if (selected.length !== wanted.size) throw new HttpError(400, "بعض العناصر لم تعد موجودة لدى المزوّد");
    }
    const imported = await importProviderAssets(id, selected, active);
    await audit("provider.catalog.import", "provider", id, { section, categoryId, search: Boolean(search), imported, active, mode: body.allFiltered === true ? "filtered" : "selected" });
    revalidateTag("wiva-viewer-catalog", { expire: 0 });
    return Response.json({ ok: true, imported, active }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
