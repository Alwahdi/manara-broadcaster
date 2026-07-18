"use client";

import { CheckCircle2, LibraryBig, LoaderCircle, Plus, Power, ServerCog, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import type { ProviderSummary } from "@/lib/types";

export function ProviderManager({ initial }: { initial: ProviderSummary[] }) {
  const [providers, setProviders] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/admin/providers", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(data.entries())),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setProviders(payload.providers); form.reset(); setMessage("تم حفظ المزوّد بحالة متوقف حتى تفعّله بعد اختبار الحقوق والمصدر.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر الحفظ"); }
    finally { setPending(false); }
  }

  async function toggle(provider: ProviderSummary) {
    const status = provider.status === "active" ? "disabled" : "active";
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/providers/${provider.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setProviders(payload.providers);
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تغيير الحالة"); }
    finally { setPending(false); }
  }

  return (
    <div className="manager-grid">
      <section className="ops-card">
        <div className="ops-card-heading"><div><ServerCog /><span><h2>المزوّدون</h2><p>بدّل بين مصادر مرخّصة من دون كشف بياناتها.</p></span></div><span className="count-badge">{providers.length}</span></div>
        <div className="provider-list">
          {providers.length ? providers.map((provider) => (
            <article key={provider.id} className="provider-row provider-row-with-library">
              <div className="provider-avatar">{provider.name.slice(0, 2)}</div>
              <div><strong>{provider.name}</strong><span>{provider.kind} · أولوية {provider.priority}</span><small>{provider.rightsReference}</small></div>
              <span className={`status-badge ${provider.status}`}>{provider.status === "active" ? "نشط" : provider.status === "disabled" ? "متوقف" : "مراجعة"}</span>
              <Link className="icon-button" href={`/admin/providers/${provider.id}`} aria-label="فتح مكتبة المزوّد"><LibraryBig size={18} /></Link>
              <button className="icon-button" onClick={() => toggle(provider)} disabled={pending} aria-label="تغيير حالة المزوّد"><Power size={18} /></button>
            </article>
          )) : <div className="inline-empty"><ShieldAlert /><p>لا يوجد مزوّد. الإنتاج يبقى مقفلاً حتى إضافة مصدر مرخّص.</p></div>}
        </div>
      </section>

      <section className="ops-card sticky-card">
        <div className="ops-card-heading"><div><Plus /><span><h2>إضافة مزوّد</h2><p>لن تُعرض بيانات الدخول بعد الحفظ.</p></span></div></div>
        <form className="stack-form" onSubmit={create}>
          <label>اسم المزوّد<input name="name" placeholder="مثال: Licensed Sports Origin" required maxLength={120} /></label>
          <label>نوع الربط<select name="kind" defaultValue="licensed_xtream"><option value="licensed_xtream">Xtream / Restream مرخّص</option><option value="licensed_hls">رابط M3U / HLS مرخّص</option><option value="licensed_vod">VOD API مرخّص</option></select></label>
          <label>عنوان الخادم أو قائمة M3U<input name="baseUrl" dir="ltr" type="url" placeholder="https://origin.example.com أو http://provider.example.com:80" required /></label>
          <div className="form-pair"><label>اسم المستخدم<input name="username" dir="ltr" autoComplete="off" /></label><label>كلمة المرور<input name="password" dir="ltr" type="password" autoComplete="new-password" /></label></div>
          <label>مرجع حق إعادة التوزيع<textarea name="rightsReference" placeholder="رقم العقد، اسم الجهة، ونطاق الدول/الشبكات المسموحة" required minLength={8} /></label>
          <label>الأولوية<input name="priority" type="number" min="1" max="9999" defaultValue="100" /></label>
          <label className="check-row risk-row"><input name="allowInsecureHttp" type="checkbox" value="true" /><span><strong>السماح باتصال HTTP غير مشفّر</strong><small>للاختبار المحلي فقط. قد يتمكن مزوّد الشبكة من اعتراض اسم المستخدم وكلمة المرور.</small></span></label>
          <label className="check-row"><input name="attested" type="checkbox" value="true" required /><span>أؤكد أن لدي حقًا مكتوبًا لإعادة توزيع هذا المحتوى.</span></label>
          {message ? <p className="form-message"><CheckCircle2 size={17} />{message}</p> : null}
          <button className="button primary wide" disabled={pending}>{pending ? <LoaderCircle className="spin" /> : <Plus />}حفظ المزوّد</button>
        </form>
      </section>
    </div>
  );
}
