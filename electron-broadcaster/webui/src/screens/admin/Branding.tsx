import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { PageHeader } from "@/components/common";
import { useBrand } from "@/hooks/useBrand";
import { useFormDraft } from "@/hooks/useFormDraft";

export function AdminBranding() {
  const { query } = useBrand();
  const qc = useQueryClient();
  const draft = useFormDraft("branding", query.data ? {
    brandName: String(query.data.brandName || ""),
    networkName: String(query.data.networkName || ""),
    logo: String(query.data.networkLogoDataUrl || query.data.settings?.networkLogoDataUrl || ""),
  } : undefined);
  const { brandName = "", networkName = "", logo = "" } = draft.values;
  const set = (key: string, value: string) => draft.setValues((previous) => ({ ...previous, [key]: value }));
  const [logoError, setLogoError] = useState("");
  const [reading, setReading] = useState(false);

  const save = useMutation({
    mutationFn: () => api.saveSettings({ brandName, networkName, networkLogoDataUrl: logo }),
    onSuccess: () => {
      draft.accept();
      return qc.invalidateQueries({ queryKey: ["agent-state"] });
    },
  });
  const readLogo = (file?: File) => {
    if (!file) return;
    setLogoError("");
    if (file.type !== "image/png" || file.size > 2 * 1024 * 1024) {
      setLogoError("اختر صورة PNG بحجم لا يتجاوز 2 ميغابايت.");
      return;
    }
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => set("logo", String(reader.result || ""));
    reader.onerror = () => setLogoError("تعذّرت قراءة الصورة. اختر الملف مرة أخرى.");
    reader.onloadend = () => setReading(false);
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <PageHeader title="الهوية" subtitle="اسم الشبكة والعلامة الظاهرة للمشاهدين" />
      <QueryBoundary query={query}>
        {() => (
          <form className="card card-pad" onSubmit={(event) => {
            event.preventDefault();
            if (!save.isPending && !reading) save.mutate();
          }}>
            <fieldset className="form-fields" disabled={save.isPending || reading}>
            <div className="field">
              <label htmlFor="branding-name">اسم العلامة</label>
              <input id="branding-name" className="input" value={brandName} onChange={(e) => set("brandName", e.target.value)} placeholder="اسم الشبكة الظاهر" required />
              <span className="hint">يظهر في الترويسة وشاشات المشاهدين.</span>
            </div>
            <div className="field">
              <label htmlFor="branding-network">اسم الشبكة</label>
              <input id="branding-network" className="input" value={networkName} onChange={(e) => set("networkName", e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="branding-logo">شعار الشبكة PNG</label>
              <input id="branding-logo" className="input" type="file" accept="image/png" aria-describedby="branding-logo-hint" aria-invalid={!!logoError} onChange={(e) => readLogo(e.target.files?.[0])} />
              {logo ? (
                <div className="brand-preview">
                  <img src={logo} alt="" />
                  <button className="btn btn-sm btn-ghost" type="button" onClick={() => set("logo", "")}>
                    إزالة الشعار
                  </button>
                </div>
              ) : null}
              <span id="branding-logo-hint" className="hint">PNG حتى 2 ميغابايت. يظهر الشعار في واجهة المشاهدة ولوحة الإدارة بعد الحفظ.</span>
              {reading ? <span role="status">جارٍ قراءة الصورة…</span> : null}
              {logoError ? <span role="alert" className="form-error">{logoError}</span> : null}
            </div>
            <div className="row">
              <button type="submit" className="btn btn-primary" disabled={save.isPending || reading}>
                {save.isPending ? "جارٍ الحفظ…" : "حفظ"}
              </button>
              <button type="button" className="btn btn-ghost" disabled={!draft.dirty || save.isPending || reading} onClick={() => {
                if (window.confirm("تجاهل التغييرات غير المحفوظة؟")) { draft.discard(); save.reset(); setLogoError(""); }
              }}>تجاهل التغييرات</button>
              {draft.dirty ? <span role="status" className="badge badge-warn">تغييرات غير محفوظة</span>
                : save.isSuccess ? <span role="status" className="badge badge-on badge-dot">تم الحفظ</span> : null}
              {save.isError ? <span role="alert" className="badge badge-warn">{(save.error as Error).message}</span> : null}
            </div>
            {draft.changedElsewhere ? <p role="status" className="notice">تغيّرت الهوية على الخادم. احتفظنا بمسودتك؛ راجعها قبل الحفظ أو تجاهلها لتحميل القيم الحالية.</p> : null}
            </fieldset>
          </form>
        )}
      </QueryBoundary>
    </div>
  );
}
