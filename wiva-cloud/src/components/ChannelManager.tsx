"use client";

import { Check, CheckCircle2, CircleAlert, Clapperboard, Eye, EyeOff, LoaderCircle, PlayCircle, Plus, Power, RotateCcw, Search, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AssetKind, CatalogAsset, ProviderSummary } from "@/lib/types";

export function ChannelManager({ initial, providers }: { initial: CatalogAsset[]; providers: ProviderSummary[] }) {
  const [assets, setAssets] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<AssetKind | "">("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"" | "active" | "disabled">("");
  const [safety, setSafety] = useState<"" | "safe" | "restricted" | "non_playable">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [displayLimit, setDisplayLimit] = useState(60);

  const categories = useMemo(() => [...new Set(assets.map((asset) => asset.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar")), [assets]);
  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("ar");
    return assets.filter((asset) => (!kind || asset.kind === kind) && (!category || asset.category === category) && (!status || (status === "active" ? asset.isActive : !asset.isActive)) && (!safety || (safety === "safe" ? !asset.isRestricted && asset.isPlayable : safety === "restricted" ? asset.isRestricted : !asset.isPlayable)) && (!search || `${asset.title} ${asset.category}`.toLocaleLowerCase("ar").includes(search)));
  }, [assets, query, kind, category, status, safety]);
  useEffect(() => { setDisplayLimit(60); }, [query, kind, category, status, safety]);
  const renderedAssets = visible.slice(0, displayLimit);
  const allVisibleSelected = Boolean(visible.length) && visible.every((asset) => selected.has(asset.id));

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/admin/assets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(data.entries())) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
      setAssets(payload.assets); form.reset(); setMessageTone("success"); setMessage("تمت الإضافة بحالة غير مفعّلة. اختبر التشغيل ثم انشر العنصر.");
    } catch (error) { setMessageTone("error"); setMessage(error instanceof Error ? error.message : "تعذر الحفظ"); }
    finally { setPending(false); }
  }

  async function toggle(asset: CatalogAsset) {
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/assets/${asset.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: !asset.isActive }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setAssets(payload.assets); setMessageTone("success"); setMessage(`تم ${asset.isActive ? "إخفاء" : "نشر"} «${asset.title}».`);
    } catch (error) { setMessageTone("error"); setMessage(error instanceof Error ? error.message : "تعذر تغيير الحالة"); }
    finally { setPending(false); }
  }

  async function updateSafety(asset: CatalogAsset, change: { restricted?: boolean; playable?: boolean }) {
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/assets/${asset.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(change) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
      setAssets(payload.assets); setMessageTone("success");
      setMessage(change.restricted !== undefined ? (change.restricted ? "تم تقييد المحتوى وإخفاؤه عن الجمهور." : "تم اعتماد المحتوى كملائم للعرض.") : (change.playable ? "تم اعتماد العنصر كفيديو قابل للتشغيل." : "تم تحويل العنصر إلى معلومة غير قابلة للتشغيل."));
    } catch (error) { setMessageTone("error"); setMessage(error instanceof Error ? error.message : "تعذر تحديث التصنيف"); }
    finally { setPending(false); }
  }

  async function bulk(active: boolean) {
    if (!selected.size) return;
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/admin/assets/bulk", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [...selected], active }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
      setAssets(payload.assets); setSelected(new Set()); setMessageTone("success"); setMessage(`تم ${active ? "نشر" : "إخفاء"} ${payload.updated} عنصر.`);
    } catch (error) { setMessageTone("error"); setMessage(error instanceof Error ? error.message : "تعذر تعديل العناصر"); }
    finally { setPending(false); }
  }

  async function bulkDelete() {
    if (!selected.size || !window.confirm(`حذف ${selected.size} عنصرًا نهائيًا؟ يشمل ذلك حلقات المسلسلات المحددة.`)) return;
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/admin/assets/bulk", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [...selected], confirmation: "delete-selected-content" }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
      setAssets(payload.assets); setSelected(new Set()); setMessageTone("success"); setMessage(`تم حذف ${payload.deleted} عنصرًا ومحتواه المرتبط.`);
    } catch (error) { setMessageTone("error"); setMessage(error instanceof Error ? error.message : "تعذر حذف العناصر"); }
    finally { setPending(false); }
  }

  async function remove(asset: CatalogAsset) {
    const detail = asset.kind === "series" && !asset.parentAssetId ? " وسيتم حذف جميع مواسمه وحلقاته" : "";
    if (!window.confirm(`حذف «${asset.title}» نهائيًا${detail}؟`)) return;
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/assets/${asset.id}`, { method: "DELETE" });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
      setAssets(payload.assets);
      setSelected((current) => { const next = new Set(current); next.delete(asset.id); return next; });
      setMessageTone("success"); setMessage(`تم حذف «${asset.title}»${detail}.`);
    } catch (error) { setMessageTone("error"); setMessage(error instanceof Error ? error.message : "تعذر حذف المحتوى"); }
    finally { setPending(false); }
  }

  function toggleSelected(id: string) { setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  function toggleVisible() { setSelected((current) => { const next = new Set(current); for (const asset of visible) allVisibleSelected ? next.delete(asset.id) : next.add(asset.id); return next; }); }
  function clearFilters() { setQuery(""); setKind(""); setCategory(""); setStatus(""); setSafety(""); }
  const filtersActive = Boolean(query || kind || category || status || safety);

  return <div className="manager-grid content-manager-grid">
    <section className="ops-card">
      <div className="ops-card-heading"><div><Clapperboard /><span><h2>القنوات والمكتبة</h2><p>ابحث وحدد ثم انشر أو أوقف عدة عناصر دفعة واحدة.</p></span></div><span className="count-badge">{visible.length}/{assets.length}</span></div>
      <div className="asset-filter-panel">
        <label className="asset-search"><span className="sr-only">البحث في المحتوى</span><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث في المحتوى المستورد…" /></label>
        <select aria-label="تصفية حسب النوع" value={kind} onChange={(event) => setKind(event.target.value as AssetKind | "")}><option value="">كل الأنواع</option><option value="live">مباشر</option><option value="movie">أفلام</option><option value="series">مسلسلات</option></select>
        <select aria-label="تصفية حسب التصنيف" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">كل التصنيفات</option>{categories.map((value) => <option key={value}>{value}</option>)}</select>
        <select aria-label="تصفية حسب الحالة" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="">كل الحالات</option><option value="active">منشور</option><option value="disabled">متوقف</option></select>
        <select aria-label="تصفية حسب الأمان" value={safety} onChange={(event) => setSafety(event.target.value as typeof safety)}><option value="">كل تصنيفات العرض</option><option value="safe">ملائم وقابل للتشغيل</option><option value="restricted">مقيّد</option><option value="non_playable">معلومة وليست فيديو</option></select>
      </div>
      {filtersActive ? <button className="clear-filters" type="button" onClick={clearFilters}><RotateCcw size={15} />مسح عوامل التصفية</button> : null}
      <div className="asset-bulk-bar"><button className="button secondary" onClick={toggleVisible} disabled={!visible.length}>{allVisibleSelected ? "إلغاء تحديد النتائج" : "تحديد النتائج"}</button><span>{selected.size} محدد</span><div><button onClick={() => void bulk(false)} disabled={pending || !selected.size}><EyeOff />إخفاء</button><button onClick={() => void bulk(true)} disabled={pending || !selected.size}><Eye />نشر</button><button className="danger" onClick={() => void bulkDelete()} disabled={pending || !selected.size}><Trash2 />حذف</button></div></div>
      {message ? <p className={`form-message ${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>{messageTone === "error" ? <CircleAlert size={17} /> : <CheckCircle2 size={17} />}{message}</p> : null}
      <div className="asset-admin-grid content-asset-grid">
        {renderedAssets.map((asset) => <article key={asset.id} className={`asset-admin-card ${selected.has(asset.id) ? "selected" : ""}`}>
          <button className="mini-art asset-select" onClick={() => toggleSelected(asset.id)} aria-label="تحديد العنصر">{selected.has(asset.id) ? <Check /> : asset.title.slice(0, 2)}</button>
          <div><span className="asset-kind">{asset.kind === "live" ? "مباشر" : asset.kind === "movie" ? "فيلم" : "مسلسل"}</span><strong>{asset.title}</strong><small>{asset.category || "غير مصنف"} · {asset.quality}</small><span className={`asset-safety ${asset.isRestricted ? "restricted" : !asset.isPlayable ? "info" : "safe"}`}>{asset.isRestricted ? <><ShieldAlert /> مقيّد</> : !asset.isPlayable ? <><CircleAlert /> معلومة فقط</> : <><ShieldCheck /> ملائم</>}</span></div>
          <div className="asset-card-actions">
            <button className={`toggle-button ${asset.isActive ? "on" : ""}`} onClick={() => void toggle(asset)} disabled={pending}><Power size={16} />{asset.isActive ? "منشور" : "متوقف"}</button>
            <button className="asset-safety-button" onClick={() => void updateSafety(asset, { restricted: !asset.isRestricted })} disabled={pending}>{asset.isRestricted ? <ShieldCheck /> : <ShieldAlert />}{asset.isRestricted ? "اعتماد" : "تقييد"}</button>
            <button className="asset-safety-button" onClick={() => void updateSafety(asset, { playable: !asset.isPlayable })} disabled={pending}>{asset.isPlayable ? <CircleAlert /> : <PlayCircle />}{asset.isPlayable ? "معلومة" : "فيديو"}</button>
            <button className="asset-delete-button" onClick={() => void remove(asset)} disabled={pending} aria-label={`حذف ${asset.title}`}><Trash2 size={16} />حذف</button>
          </div>
        </article>)}
        {!visible.length ? <div className="inline-empty"><Search /><p>لا يوجد محتوى يطابق البحث والفلاتر الحالية.</p></div> : null}
      </div>
      {renderedAssets.length < visible.length ? <div className="admin-load-more"><span>يظهر {renderedAssets.length.toLocaleString("ar")} من {visible.length.toLocaleString("ar")}</span><button className="button secondary" type="button" onClick={() => setDisplayLimit((value) => value + 60)}>عرض المزيد</button></div> : null}
    </section>
    <section className="ops-card sticky-card">
      <div className="ops-card-heading"><div><Plus /><span><h2>إضافة عنصر يدويًا</h2><p>للقنوات أو العناصر غير الموجودة في فهرس المزوّد.</p></span></div></div>
      <form className="stack-form" onSubmit={create}>
        <label>المزوّد<select name="providerId" required defaultValue=""><option value="" disabled>اختر مزوّدًا</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
        <label>النوع<select name="kind" defaultValue="live"><option value="live">قناة مباشرة</option><option value="movie">فيلم</option><option value="series">مسلسل</option></select></label>
        <label>العنوان<input name="title" required maxLength={180} /></label>
        <label>مرجع العنصر لدى المزوّد<input name="providerAssetRef" dir="ltr" required placeholder="مثال: 18452" /></label>
        <div className="form-pair"><label>التصنيف<input name="category" /></label><label>الجودة<input name="quality" defaultValue="FHD" /></label></div>
        <label>اللغة<input name="language" defaultValue="العربية" /></label><label>الوصف<textarea name="description" /></label>
        <button className="button primary wide" disabled={pending || !providers.length}>{pending ? <LoaderCircle className="spin" /> : <Plus />}إضافة بحالة متوقفة</button>
      </form>
    </section>
  </div>;
}
