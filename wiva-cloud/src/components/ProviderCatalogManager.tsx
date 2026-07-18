"use client";

import { BellRing, Check, ChevronLeft, ChevronRight, CloudDownload, Eye, Film, FolderCheck, LoaderCircle, Radio, RefreshCw, Search, Tv2, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssetKind, ProviderCatalogCategory, ProviderCatalogItem, ProviderSeriesEpisode, ProviderSummary, ProviderSyncRule } from "@/lib/types";

type CatalogResponse = {
  ok: boolean;
  error?: string;
  categories: ProviderCatalogCategory[];
  items: ProviderCatalogItem[];
  page: number;
  limit: number;
  total: number;
  totalUnfiltered: number;
};

const sectionOptions: { id: AssetKind; label: string; icon: typeof Radio }[] = [
  { id: "live", label: "القنوات المباشرة", icon: Radio },
  { id: "movie", label: "الأفلام", icon: Film },
  { id: "series", label: "المسلسلات", icon: Tv2 },
];

export function ProviderCatalogManager({ provider }: { provider: ProviderSummary }) {
  const [section, setSection] = useState<AssetKind>("live");
  const [categoryId, setCategoryId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [publish, setPublish] = useState(false);
  const [message, setMessage] = useState("");
  const [fresh, setFresh] = useState(0);
  const [openSeries, setOpenSeries] = useState<ProviderCatalogItem | null>(null);
  const [episodes, setEpisodes] = useState<ProviderSeriesEpisode[]>([]);
  const [episodeSelection, setEpisodeSelection] = useState<Set<string>>(new Set());
  const [episodeLoading, setEpisodeLoading] = useState(false);
  const [season, setSeason] = useState<number | null>(null);
  const [tracking, setTracking] = useState<ProviderSyncRule | null>(null);
  const [autoTrack, setAutoTrack] = useState(false);
  const [trackingSaving, setTrackingSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const loadSequence = useRef(0);
  const seriesInspectorRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true); setMessage("");
    try {
      const params = new URLSearchParams({ section, page: String(page), limit: "60" });
      if (categoryId) params.set("category", categoryId);
      if (search) params.set("q", search);
      if (fresh) params.set("fresh", "true");
      const response = await fetch(`/api/admin/providers/${provider.id}/catalog?${params}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "تعذر قراءة فهرس المزوّد");
      if (sequence !== loadSequence.current) return;
      setData(payload); setSelected(new Set());
    } catch (error) { if (sequence === loadSequence.current) { setData(null); setMessage(error instanceof Error ? error.message : "تعذر قراءة فهرس المزوّد"); } }
    finally { if (sequence === loadSequence.current) setLoading(false); }
  }, [provider.id, section, categoryId, search, page, fresh]);

  useEffect(() => { void load(); }, [load]);

  function changeSection(value: AssetKind) {
    loadSequence.current += 1; setData(null); setLoading(true); setSelected(new Set());
    setSection(value); setCategoryId(""); setSearch(""); setSearchInput(""); setPage(1); setFresh(0); setOpenSeries(null); setEpisodes([]);
  }

  async function inspectSeries(item: ProviderCatalogItem) {
    setOpenSeries(item); setEpisodes([]); setEpisodeSelection(new Set()); setSeason(null); setTracking(null); setAutoTrack(false); setEpisodeLoading(true); setMessage("");
    requestAnimationFrame(() => seriesInspectorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    try {
      const params = new URLSearchParams({ section: "series", seriesRef: item.ref });
      const response = await fetch(`/api/admin/providers/${provider.id}/catalog?${params}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "تعذر تحميل حلقات المسلسل");
      setEpisodes(payload.episodes);
      setTracking(payload.tracking || null);
      setAutoTrack(payload.tracking?.enabled === true);
      if (payload.tracking) setPublish(payload.tracking.publishNew === true);
      setSeason(payload.episodes[0]?.seasonNumber ?? null);
      requestAnimationFrame(() => seriesInspectorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تحميل حلقات المسلسل"); }
    finally { setEpisodeLoading(false); }
  }

  async function importEpisodes() {
    if (!openSeries || !episodeSelection.size) return;
    setImporting(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/providers/${provider.id}/catalog`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ section: "series", seriesRef: openSeries.ref, episodeRefs: [...episodeSelection], active: publish, autoTrack }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "تعذر استيراد الحلقات");
      setEpisodeSelection(new Set()); setMessage(`تم استيراد ${payload.imported} حلقة${publish ? " ونشرها للمشاهدين" : " بحالة متوقفة للمراجعة"}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر استيراد الحلقات"); }
    finally { setImporting(false); }
  }

  async function saveTracking() {
    if (!openSeries) return;
    setTrackingSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/providers/${provider.id}/catalog`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ seriesRef: openSeries.ref, enabled: autoTrack, publishNew: publish }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "تعذر حفظ المتابعة التلقائية");
      setTracking(payload.tracking); setMessage(autoTrack ? "تم تفعيل الفحص اليومي للحلقات والمواسم الجديدة." : "تم إيقاف المتابعة التلقائية لهذا المسلسل.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر حفظ المتابعة التلقائية"); }
    finally { setTrackingSaving(false); }
  }

  async function syncNow() {
    setSyncing(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/providers/${provider.id}/sync`, { method: "POST" });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "تعذر بدء الفحص الآن");
      setMessage(payload.failed ? `تم الفحص مع تعذر تحديث ${payload.failed} مسلسل. أضيفت ${payload.added} حلقة جديدة.` : `تم الفحص بنجاح. أضيفت ${payload.added} حلقة جديدة.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر بدء الفحص الآن"); }
    finally { setSyncing(false); }
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault(); setSearch(searchInput.trim()); setPage(1);
  }

  function toggle(ref: string) {
    setSelected((current) => { const next = new Set(current); next.has(ref) ? next.delete(ref) : next.add(ref); return next; });
  }

  const allPageSelected = useMemo(() => Boolean(data?.items.length) && data!.items.every((item) => selected.has(item.ref)), [data, selected]);

  function togglePage() {
    if (!data) return;
    setSelected((current) => {
      const next = new Set(current);
      for (const item of data.items) allPageSelected ? next.delete(item.ref) : next.add(item.ref);
      return next;
    });
  }

  async function importItems(allFiltered: boolean) {
    if (!allFiltered && !selected.size) return;
    setImporting(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/providers/${provider.id}/catalog`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ section, categoryId, q: search, refs: [...selected], allFiltered, active: publish }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "تعذر الاستيراد");
      setSelected(new Set());
      setMessage(`تم استيراد ${payload.imported} عنصر${publish ? " ونشره للمشاهدين" : " بحالة متوقفة للمراجعة"}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر الاستيراد"); }
    finally { setImporting(false); }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return <div className="provider-catalog-workspace">
    {provider.trackedSeriesCount > 0 ? <section className="provider-sync-summary ops-card"><div><span><BellRing /></span><div><strong>متابعة تلقائية يومية</strong><p>{provider.trackedSeriesCount.toLocaleString("ar")} مسلسل تحت المتابعة؛ تُستورد الحلقات والمواسم الجديدة فقط.</p></div></div><button className="button secondary" disabled={syncing} onClick={() => void syncNow()}>{syncing ? <LoaderCircle className="spin" /> : <RefreshCw />}فحص الآن</button></section> : null}
    <section className="catalog-toolbar ops-card">
      <div className="catalog-section-tabs" role="tablist">
        {sectionOptions.map((option) => <button key={option.id} role="tab" className={section === option.id ? "active" : ""} aria-selected={section === option.id} onClick={() => changeSection(option.id)}><option.icon size={17} />{option.label}</button>)}
      </div>
      <form className="catalog-admin-search" onSubmit={submitSearch}>
        <Search size={18} /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="ابحث باسم قناة، فيلم أو مسلسل…" /><button className="button primary" type="submit">بحث</button>
      </form>
      <div className="catalog-filter-row">
        <label><span>التصنيف</span><select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }}><option value="">كل التصنيفات</option>{data?.categories.map((category) => <option key={category.id} value={category.id}>{category.name} ({category.count})</option>)}</select></label>
        <button className="button secondary" onClick={() => { setPage(1); setFresh((value) => value + 1); }} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={17} />فحص جديد</button>
        <div className="catalog-summary"><strong>{data?.total.toLocaleString("ar") || 0}</strong><span>نتيجة من {data?.totalUnfiltered.toLocaleString("ar") || 0}</span></div>
      </div>
    </section>

    <section className="catalog-selection-bar">
      {section === "series" ? <span><strong>المسلسلات:</strong> افتح أي مسلسل ثم اختر المواسم والحلقات.</span> : <>
      <button className="button secondary" onClick={togglePage} disabled={!data?.items.length}><FolderCheck size={17} />{allPageSelected ? "إلغاء تحديد الصفحة" : "تحديد الصفحة"}</button>
      <span><strong>{selected.size}</strong> عنصر محدد</span>
      <label className="publish-switch"><input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} /><span>نشر مباشرة للمشاهدين</span></label>
      <div className="selection-actions">
        <button className="button secondary" disabled={importing || !data?.total} onClick={() => void importItems(true)}>{importing ? <LoaderCircle className="spin" /> : <CloudDownload size={17} />}استيراد كل النتائج</button>
        <button className="button primary" disabled={importing || !selected.size} onClick={() => void importItems(false)}>{importing ? <LoaderCircle className="spin" /> : <CloudDownload size={17} />}استيراد المحدد</button>
      </div>
      </>}
    </section>

    {message ? <div className={`catalog-feedback ${message.startsWith("تم") ? "success" : "error"}`}>{message.startsWith("تم") ? <Check size={18} /> : null}<span>{message}</span>{message.startsWith("تم") ? <Link href="/admin/channels">فتح المحتوى المستورد</Link> : null}</div> : null}

    {section === "series" && openSeries ? <section ref={seriesInspectorRef} className="series-inspector ops-card">
      <div className="series-inspector-heading"><div><Tv2 /><span><h2>{openSeries.title}</h2><p>{episodeLoading ? "جارٍ جلب المواسم والحلقات…" : `${episodes.length.toLocaleString("ar")} حلقة متاحة من المزوّد`}</p></span></div><button className="icon-button" onClick={() => setOpenSeries(null)} aria-label="إغلاق"><X /></button></div>
      {episodeLoading ? <div className="series-episode-loading"><LoaderCircle className="spin" /></div> : episodes.length ? <>
        <div className="series-automation-panel"><div><BellRing /><span><strong>متابعة الحلقات الجديدة</strong><small>يفحص WIVA هذا المسلسل كل 24 ساعة ويستورد الإضافات فقط.</small></span></div><div className="series-automation-actions"><label className="publish-switch"><input type="checkbox" checked={autoTrack} onChange={(event) => setAutoTrack(event.target.checked)} /><span>متابعة تلقائية</span></label><label className="publish-switch"><input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} /><span>نشر الحلقات الجديدة</span></label><button className="button secondary" disabled={trackingSaving} onClick={() => void saveTracking()}>{trackingSaving ? <LoaderCircle className="spin" /> : <Check />}حفظ</button></div>{tracking?.lastSuccessAt ? <small>آخر فحص ناجح: {new Date(tracking.lastSuccessAt).toLocaleString("ar")}</small> : null}</div>
        <div className="season-tabs">{[...new Set(episodes.map((episode) => episode.seasonNumber))].map((value) => <button key={value} className={season === value ? "active" : ""} aria-pressed={season === value} onClick={() => setSeason(value)}>الموسم {value.toLocaleString("ar")}</button>)}</div>
        <div className="episode-select-actions"><button className="button secondary" onClick={() => setEpisodeSelection((current) => { const next = new Set(current); for (const episode of episodes.filter((item) => item.seasonNumber === season)) next.add(episode.ref); return next; })}>تحديد الموسم</button><span>{episodeSelection.size.toLocaleString("ar")} حلقة محددة</span><button className="button primary" disabled={!episodeSelection.size || importing} onClick={() => void importEpisodes()}>{importing ? <LoaderCircle className="spin" /> : <CloudDownload />}استيراد الحلقات المحددة</button></div>
        <div className="episode-picker">{episodes.filter((episode) => episode.seasonNumber === season).map((episode) => <button key={episode.ref} className={episodeSelection.has(episode.ref) ? "selected" : ""} onClick={() => setEpisodeSelection((current) => { const next = new Set(current); next.has(episode.ref) ? next.delete(episode.ref) : next.add(episode.ref); return next; })}><i>{episodeSelection.has(episode.ref) ? <Check /> : episode.episodeNumber.toLocaleString("ar")}</i><span><strong>{episode.title}</strong><small>الحلقة {episode.episodeNumber.toLocaleString("ar")} · {episode.containerExtension.toUpperCase()}</small></span></button>)}</div>
      </> : <div className="catalog-loading empty compact"><Tv2 /><h3>لا توجد حلقات</h3><p>المزوّد يعرض عنوان المسلسل لكنه لا يعيد أي مواسم أو حلقات قابلة للاستيراد.</p></div>}
    </section> : null}

    {loading ? <div className="catalog-loading"><LoaderCircle className="spin" /><h3>جارٍ فحص مكتبة المزوّد…</h3><p>قد يستغرق أول فحص عدة ثوانٍ حسب حجم الفهرس.</p></div> : data?.items.length ? <div className="provider-catalog-grid">
      {data.items.map((item) => <button key={item.ref} className={`catalog-source-card ${selected.has(item.ref) || openSeries?.ref === item.ref ? "selected" : ""}`} onClick={() => section === "series" ? void inspectSeries(item) : toggle(item.ref)}>
        <div className="source-art" style={item.artworkUrl ? { backgroundImage: `url(${JSON.stringify(item.artworkUrl)})` } : undefined}><span>{item.title.slice(0, 2)}</span><i>{selected.has(item.ref) ? <Check size={17} /> : null}</i><small>{item.quality}</small></div>
        <div><strong>{item.title}</strong><span>{item.category}</span>{item.year ? <small>{item.year}</small> : null}{section === "series" ? <small className="series-open-label"><Eye size={13} /> فتح المواسم والحلقات</small> : null}</div>
      </button>)}
    </div> : <div className="catalog-loading empty"><Search /><h3>لا توجد نتائج</h3><p>غيّر التصنيف أو عبارة البحث، أو أعد فحص المزوّد.</p></div>}

    {data && pages > 1 ? <nav className="catalog-pagination" aria-label="صفحات فهرس المزوّد"><button aria-label="الصفحة السابقة" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronRight /></button><span aria-live="polite">صفحة {page.toLocaleString("ar")} من {pages.toLocaleString("ar")}</span><button aria-label="الصفحة التالية" disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)}><ChevronLeft /></button></nav> : null}
  </div>;
}
