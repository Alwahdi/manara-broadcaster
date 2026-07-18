"use client";

import { CheckCircle2, CircleAlert, LoaderCircle, Plus, Search, ShieldBan, UserCheck, UsersRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ViewerSummary } from "@/lib/types";

export function ViewerManager({ initial }: { initial: ViewerSummary[] }) {
  const [viewers, setViewers] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [pendingViewerId, setPendingViewerId] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [query, setQuery] = useState("");
  const [displayLimit, setDisplayLimit] = useState(80);
  const visibleViewers = useMemo(() => {
    const value = query.trim().toLocaleLowerCase("ar");
    return value ? viewers.filter((viewer) => `${viewer.name} ${viewer.email}`.toLocaleLowerCase("ar").includes(value)) : viewers;
  }, [query, viewers]);
  useEffect(() => { setDisplayLimit(80); }, [query]);
  const renderedViewers = visibleViewers.slice(0, displayLimit);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setCreating(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/viewers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(data.entries())) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setViewers(payload.viewers);
      form.reset();
      setMessageTone("success");
      setMessage("تم إنشاء حساب المشاهد. شارك بيانات الدخول معه بطريقة آمنة.");
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "تعذر إنشاء الحساب");
    } finally {
      setCreating(false);
    }
  }

  async function toggle(viewer: ViewerSummary) {
    const status = viewer.status === "active" ? "blocked" : "active";
    setPendingViewerId(viewer.id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/viewers/${viewer.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setViewers(payload.viewers);
      setMessageTone("success");
      setMessage(status === "active" ? `تم تفعيل حساب ${viewer.name}.` : `تم إيقاف حساب ${viewer.name}.`);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "تعذر تعديل الحساب");
    } finally {
      setPendingViewerId("");
    }
  }

  return (
    <div className="manager-grid">
      <section className="ops-card">
        <div className="ops-card-heading"><div><UsersRound /><span><h2>حسابات المشاهدين</h2><p>ابحث عن الحسابات وتابع حالتها وصلاحيتها.</p></span></div><span className="count-badge">{visibleViewers.length}/{viewers.length}</span></div>
        <label className="asset-search viewer-search"><span className="sr-only">البحث عن مشاهد</span><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو البريد الإلكتروني" /></label>
        {message ? <p className={`form-message ${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>{messageTone === "error" ? <CircleAlert size={17} /> : <CheckCircle2 size={17} />}{message}</p> : null}
        <div className="provider-list">
          {renderedViewers.map((viewer) => (
            <article className="provider-row" key={viewer.id}>
              <div className="provider-avatar">{viewer.name.slice(0, 2)}</div>
              <div><strong>{viewer.name}</strong><span dir="ltr">{viewer.email}</span><small>{viewer.maxConcurrentStreams} بث متزامن {viewer.expiresAt ? `· ينتهي ${new Date(viewer.expiresAt).toLocaleDateString("ar")}` : "· بلا تاريخ انتهاء"}</small></div>
              <span className={`status-badge ${viewer.status === "active" ? "active" : "disabled"}`}>{viewer.status === "active" ? "نشط" : "موقوف"}</span>
              <button className="icon-button" onClick={() => toggle(viewer)} disabled={pendingViewerId === viewer.id} aria-label={viewer.status === "active" ? `إيقاف حساب ${viewer.name}` : `تفعيل حساب ${viewer.name}`}>{pendingViewerId === viewer.id ? <LoaderCircle className="spin" size={18} /> : viewer.status === "active" ? <ShieldBan size={18} /> : <UserCheck size={18} />}</button>
            </article>
          ))}
          {!visibleViewers.length ? <div className="inline-empty"><UsersRound /><p>{query ? "لا توجد حسابات تطابق بحثك." : "لا توجد حسابات. أنشئ أول مشاهد من النموذج."}</p></div> : null}
        </div>
        {renderedViewers.length < visibleViewers.length ? <div className="admin-load-more"><span>يظهر {renderedViewers.length.toLocaleString("ar")} من {visibleViewers.length.toLocaleString("ar")}</span><button className="button secondary" type="button" onClick={() => setDisplayLimit((value) => value + 80)}>عرض المزيد</button></div> : null}
      </section>
      <section className="ops-card sticky-card">
        <div className="ops-card-heading"><div><Plus /><span><h2>مشاهد جديد</h2><p>أنشئ حسابًا وحدد مدة صلاحيته.</p></span></div></div>
        <form className="stack-form" onSubmit={create} aria-busy={creating}>
          <label>الاسم<input name="name" required maxLength={120} /></label>
          <label>البريد الإلكتروني<input name="email" dir="ltr" type="email" inputMode="email" autoComplete="email" required /></label>
          <label>كلمة مرور مؤقتة<input name="password" dir="ltr" type="password" minLength={12} required autoComplete="new-password" /><small className="field-help">12 حرفًا على الأقل. اطلب من المشاهد حفظها في مكان آمن.</small></label>
          <div className="form-pair"><label>عدد مرات المشاهدة المتزامنة<input name="maxConcurrentStreams" type="number" min="1" max="10" defaultValue="1" /></label><label>تاريخ الانتهاء<input name="expiresAt" type="date" /></label></div>
          <button className="button primary wide" type="submit" disabled={creating}>{creating ? <LoaderCircle className="spin" /> : <Plus />}{creating ? "جارٍ إنشاء الحساب…" : "إنشاء الحساب"}</button>
        </form>
      </section>
    </div>
  );
}
