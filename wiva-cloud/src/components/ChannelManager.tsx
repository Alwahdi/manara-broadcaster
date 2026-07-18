"use client";

import { Check, CheckCircle2, Clapperboard, Eye, EyeOff, LoaderCircle, Plus, Power, Search } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type { AssetKind, CatalogAsset, ProviderSummary } from "@/lib/types";

export function ChannelManager({ initial, providers }: { initial: CatalogAsset[]; providers: ProviderSummary[] }) {
  const [assets, setAssets] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<AssetKind | "">("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"" | "active" | "disabled">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const categories = useMemo(() => [...new Set(assets.map((asset) => asset.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar")), [assets]);
  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("ar");
    return assets.filter((asset) => (!kind || asset.kind === kind) && (!category || asset.category === category) && (!status || (status === "active" ? asset.isActive : !asset.isActive)) && (!search || `${asset.title} ${asset.category}`.toLocaleLowerCase("ar").includes(search)));
  }, [assets, query, kind, category, status]);
  const allVisibleSelected = Boolean(visible.length) && visible.every((asset) => selected.has(asset.id));

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/admin/assets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(data.entries())) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
      setAssets(payload.assets); form.reset(); setMessage("تمت الإضافة بحالة غير مفعّلة. اختبر بوابة الوسائط ثم فعّل العنصر.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر الحفظ"); }
    finally { setPending(false); }
  }

  async function toggle(asset: CatalogAsset) {
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/assets/${asset.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: !asset.isActive }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setAssets(payload.assets);
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تغيير الحالة"); }
    finally { setPending(false); }
  }

  async function bulk(active: boolean) {
    if (!selected.size) return;
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/admin/assets/bulk", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [...selected], active }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
      setAssets(payload.assets); setSelected(new Set()); setMessage(`تم ${active ? "نشر" : "إيقاف"} ${payload.updated} عنصر.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تعديل العناصر"); }
    finally { setPending(false); }
  }

  function toggleSelected(id: string) { setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  function toggleVisible() { setSelected((current) => { const next = new Set(current); for (const asset of visible) allVisibleSelected ? next.delete(asset.id) : next.add(asset.id); return next; }); }

  return <div className="manager-grid content-manager-grid">
    <section className="ops-card">
      <div className="ops-card-heading"><div><Clapperboard /><span><h2>القنوات والمكتبة</h2><p>ابحث وحدد ثم انشر أو أوقف عدة عناصر دفعة واحدة.</p></span></div><span className="count-badge">{visible.length}</span></div>
      <div className="asset-filter-panel">
        <label className="asset-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث في المحتوى المستورد…" /></label>
        <select value={kind} onChange={(event) => setKind(event.target.value as AssetKind | "")}><option value="">كل الأنواع</option><option value="live">مباشر</option><option value="movie">أفلام</option><option value="series">مسلسلات</option></select>
        <select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">كل التصنيفات</option>{categories.map((value) => <option key={value}>{value}</option>)}</select>
        <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="">كل الحالات</option><option value="active">منشور</option><option value="disabled">متوقف</option></select>
      </div>
      <div className="asset-bulk-bar"><button className="button secondary" onClick={toggleVisible} disabled={!visible.length}>{allVisibleSelected ? "إلغاء تحديد النتائج" : "تحديد النتائج"}</button><span>{selected.size} محدد</span><div><button onClick={() => void bulk(false)} disabled={pending || !selected.size}><EyeOff />إيقاف</button><button onClick={() => void bulk(true)} disabled={pending || !selected.size}><Eye />نشر</button></div></div>
      {message ? <p className="form-message"><CheckCircle2 size={17} />{message}</p> : null}
      <div className="asset-admin-grid content-asset-grid">
        {visible.map((asset) => <article key={asset.id} className={`asset-admin-card ${selected.has(asset.id) ? "selected" : ""}`}>
          <button className="mini-art asset-select" onClick={() => toggleSelected(asset.id)} aria-label="تحديد العنصر">{selected.has(asset.id) ? <Check /> : asset.title.slice(0, 2)}</button>
          <div><span className="asset-kind">{asset.kind === "live" ? "مباشر" : asset.kind === "movie" ? "فيلم" : "مسلسل"}</span><strong>{asset.title}</strong><small>{asset.category || "غير مصنف"} · {asset.quality}</small></div>
          <button className={`toggle-button ${asset.isActive ? "on" : ""}`} onClick={() => void toggle(asset)} disabled={pending}><Power size={16} />{asset.isActive ? "منشور" : "متوقف"}</button>
        </article>)}
        {!visible.length ? <div className="inline-empty"><Search /><p>لا يوجد محتوى يطابق البحث والفلاتر الحالية.</p></div> : null}
      </div>
    </section>
    <section className="ops-card sticky-card">
      <div className="ops-card-heading"><div><Plus /><span><h2>إضافة عنصر يدويًا</h2><p>للقنوات أو العناصر غير الموجودة في فهرس المزوّد.</p></span></div></div>
      <form className="stack-form" onSubmit={create}>
        <label>المزوّد<select name="providerId" required defaultValue=""><option value="" disabled>اختر مزوّدًا</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
        <label>النوع<select name="kind" defaultValue="live"><option value="live">قناة مباشرة</option><option value="movie">فيلم</option><option value="series">مسلسل</option></select></label>
        <label>العنوان<input name="title" required maxLength={180} /></label>
        <label>مرجع العنصر لدى المزوّد<input name="providerAssetRef" dir="ltr" required placeholder="channel-id or opaque provider reference" /></label>
        <div className="form-pair"><label>التصنيف<input name="category" /></label><label>الجودة<input name="quality" defaultValue="FHD" /></label></div>
        <label>اللغة<input name="language" defaultValue="العربية" /></label><label>الوصف<textarea name="description" /></label>
        <button className="button primary wide" disabled={pending || !providers.length}>{pending ? <LoaderCircle className="spin" /> : <Plus />}إضافة بحالة متوقفة</button>
      </form>
    </section>
  </div>;
}
