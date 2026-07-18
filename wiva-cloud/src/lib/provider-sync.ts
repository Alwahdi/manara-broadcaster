import { revalidateTag } from "next/cache";
import {
  audit, finishProviderSyncRule, importProviderSeries, listDueProviderSyncRules,
  listImportedSeriesEpisodeRefs, listProviderSyncRules,
} from "@/lib/db";
import { discoverProviderCatalog, discoverSeriesEpisodes, loadProviderConnection } from "@/lib/provider-catalog";
import type { ProviderSyncRule } from "@/lib/types";

type SyncResult = { checked: number; added: number; failed: number; details: Array<{ title: string; added: number; ok: boolean }> };

function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : "تعذر فحص المزوّد";
  return message.replace(/https?:\/\/\S+/gi, "عنوان المزوّد").slice(0, 400);
}

async function syncRules(rules: ProviderSyncRule[]): Promise<SyncResult> {
  const result: SyncResult = { checked: 0, added: 0, failed: 0, details: [] };
  const connections = new Map<string, Awaited<ReturnType<typeof loadProviderConnection>>>();
  const catalogs = new Map<string, Awaited<ReturnType<typeof discoverProviderCatalog>>>();
  for (const rule of rules) {
    result.checked += 1;
    try {
      let connection = connections.get(rule.providerId);
      if (!connection) { connection = await loadProviderConnection(rule.providerId); connections.set(rule.providerId, connection); }
      if (connection.status !== "active") throw new Error("المزوّد متوقف حاليًا");
      let catalog = catalogs.get(rule.providerId);
      if (!catalog) { catalog = await discoverProviderCatalog(connection, "series", true); catalogs.set(rule.providerId, catalog); }
      const series = catalog.find((item) => item.ref === rule.seriesRef);
      if (!series) throw new Error("لم يعد المسلسل موجودًا في فهرس المزوّد");
      const [available, existing] = await Promise.all([
        discoverSeriesEpisodes(connection, rule.seriesRef),
        listImportedSeriesEpisodeRefs(rule.providerId, rule.seriesRef),
      ]);
      const known = new Set(rule.knownEpisodeRefs);
      const fresh = available.filter((episode) => !known.has(episode.ref) && !existing.has(episode.ref)).slice(0, 500);
      if (fresh.length) await importProviderSeries(rule.providerId, series, fresh, rule.publishNew);
      await finishProviderSyncRule(rule.id, { added: fresh.length, knownEpisodeRefs: available.map((episode) => episode.ref) });
      await audit("provider.series.auto_sync", "provider", rule.providerId, { seriesRef: rule.seriesRef, added: fresh.length, publishNew: rule.publishNew });
      result.added += fresh.length; result.details.push({ title: rule.seriesTitle, added: fresh.length, ok: true });
    } catch (error) {
      const message = publicError(error);
      await finishProviderSyncRule(rule.id, { added: 0, error: message });
      result.failed += 1; result.details.push({ title: rule.seriesTitle, added: 0, ok: false });
    }
  }
  if (result.added) revalidateTag("wiva-viewer-catalog", { expire: 0 });
  return result;
}

export async function syncDueProviderSeries(limit = 12) {
  return syncRules(await listDueProviderSyncRules(limit));
}

export async function syncProviderSeriesNow(providerId: string) {
  return syncRules((await listProviderSyncRules(providerId)).filter((rule) => rule.enabled).slice(0, 25));
}
