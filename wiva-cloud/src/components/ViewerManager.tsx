"use client";

import { CheckCircle2, LoaderCircle, Plus, ShieldBan, UserCheck, UsersRound } from "lucide-react";
import { FormEvent, useState } from "react";
import type { ViewerSummary } from "@/lib/types";

export function ViewerManager({ initial }: { initial: ViewerSummary[] }) {
  const [viewers, setViewers] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/admin/viewers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(data.entries())) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
      setViewers(payload.viewers); form.reset(); setMessage("تم إنشاء حساب المشاهد. أرسل البيانات له عبر قناة آمنة.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر إنشاء الحساب"); }
    finally { setPending(false); }
  }

  async function toggle(viewer: ViewerSummary) {
    const status = viewer.status === "active" ? "blocked" : "active";
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/viewers/${viewer.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setViewers(payload.viewers);
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تعديل الحساب"); }
    finally { setPending(false); }
  }

  return <div className="manager-grid"><section className="ops-card"><div className="ops-card-heading"><div><UsersRound /><span><h2>حسابات المشاهدين</h2><p>الحالة وحد المشاهدة وتاريخ الانتهاء.</p></span></div><span className="count-badge">{viewers.length}</span></div><div className="provider-list">{viewers.map((viewer) => <article className="provider-row" key={viewer.id}><div className="provider-avatar">{viewer.name.slice(0,2)}</div><div><strong>{viewer.name}</strong><span dir="ltr">{viewer.email}</span><small>{viewer.maxConcurrentStreams} بث متزامن {viewer.expiresAt ? `· ينتهي ${new Date(viewer.expiresAt).toLocaleDateString("ar")}` : "· بلا تاريخ انتهاء"}</small></div><span className={`status-badge ${viewer.status === "active" ? "active" : "disabled"}`}>{viewer.status === "active" ? "نشط" : "موقوف"}</span><button className="icon-button" onClick={() => toggle(viewer)} disabled={pending} aria-label="تغيير حالة المشاهد">{viewer.status === "active" ? <ShieldBan size={18} /> : <UserCheck size={18} />}</button></article>)}{!viewers.length ? <div className="inline-empty"><UsersRound /><p>لا توجد حسابات. أنشئ أول مشاهد من النموذج.</p></div> : null}</div></section><section className="ops-card sticky-card"><div className="ops-card-heading"><div><Plus /><span><h2>مشاهد جديد</h2><p>لا تُخزّن كلمة المرور كنص صريح.</p></span></div></div><form className="stack-form" onSubmit={create}><label>الاسم<input name="name" required maxLength={120} /></label><label>البريد<input name="email" dir="ltr" type="email" required /></label><label>كلمة مرور مؤقتة<input name="password" dir="ltr" type="password" minLength={12} required autoComplete="new-password" /></label><div className="form-pair"><label>البث المتزامن<input name="maxConcurrentStreams" type="number" min="1" max="10" defaultValue="1" /></label><label>تاريخ الانتهاء<input name="expiresAt" type="date" /></label></div>{message ? <p className="form-message"><CheckCircle2 size={17} />{message}</p> : null}<button className="button primary wide" disabled={pending}>{pending ? <LoaderCircle className="spin" /> : <Plus />}إنشاء الحساب</button></form></section></div>;
}
