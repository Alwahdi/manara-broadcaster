import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { PageHeader } from "@/components/common";
import { useBrand } from "@/hooks/useBrand";

export function AdminSettings() {
  const { query } = useBrand();
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (query.data) {
      setForm({
        networkName: String(query.data.networkName || ""),
        country: String(query.data.settings?.networkCountry || query.data.country || ""),
        city: String(query.data.settings?.networkCity || query.data.city || ""),
        timezone: String(query.data.settings?.networkTimezone || query.data.timezone || ""),
        port: String(query.data.ports?.live || query.data.settings?.port || ""),
        libraryPort: String(query.data.settings?.libraryPort || query.data.ports?.libraryConfigured || query.data.ports?.library || ""),
        adminPath: String(query.data.settings?.adminPath || "admin"),
        experienceLayout: String(query.data.settings?.experienceLayout || query.data.ports?.mode || "unified"),
        autoStartOnBoot: String(query.data.settings?.autoStartOnBoot !== false),
        autoStartBeforeLogin: String(!!query.data.settings?.autoStartBeforeLogin),
      });
    }
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => api.saveSettings({
      ...form,
      networkCountry: form.country,
      networkCity: form.city,
      networkTimezone: form.timezone,
      port: Number(form.port) || undefined,
      libraryPort: Number(form.libraryPort) || undefined,
      experienceLayout: form.experienceLayout === "separate" ? "separate" : "unified",
      autoStartOnBoot: form.autoStartOnBoot === "true",
      autoStartBeforeLogin: form.autoStartBeforeLogin === "true",
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-state"] }),
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const setBool = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: String(e.target.checked) }));

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader title="الإعدادات" subtitle="إعدادات الشبكة والمنافذ العامة" />
      <QueryBoundary query={query}>
        {() => (
          <div className="card card-pad">
            <div className="field">
              <label>اسم الشبكة</label>
              <input className="input" value={form.networkName || ""} onChange={set("networkName")} />
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>الدولة</label>
                <input className="input" value={form.country || ""} onChange={set("country")} />
              </div>
              <div className="field">
                <label>المدينة</label>
                <input className="input" value={form.city || ""} onChange={set("city")} />
              </div>
            </div>
            <div className="field">
              <label>المنطقة الزمنية</label>
              <input className="input mono" dir="ltr" value={form.timezone || ""} onChange={set("timezone")} placeholder="Asia/Riyadh" />
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>منفذ البث المباشر</label>
                <input className="input mono" dir="ltr" inputMode="numeric" value={form.port || ""} onChange={set("port")} placeholder="8787" />
              </div>
              <div className="field">
                <label>منفذ الإدارة والمكتبة</label>
                <input className="input mono" dir="ltr" inputMode="numeric" value={form.libraryPort || ""} onChange={set("libraryPort")} placeholder="8788" />
              </div>
            </div>
            <div className="field">
              <label>طريقة عرض الخدمة</label>
              <select className="input" value={form.experienceLayout || "unified"} onChange={set("experienceLayout")}>
                <option value="unified">موحدة: البث والمكتبة والإدارة على منفذ البث</option>
                <option value="separate">منفصلة: البث على منفذ والمكتبة والإدارة على منفذ آخر</option>
              </select>
              <span className="hint">
                في الوضع الموحد استخدم رابط البث نفسه للمكتبة والإدارة. في الوضع المنفصل استخدم منفذ الإدارة والمكتبة.
              </span>
            </div>
            <div className="field">
              <label>مسار لوحة الإدارة</label>
              <input className="input mono" dir="ltr" value={form.adminPath || ""} onChange={set("adminPath")} placeholder="admin" />
              <span className="hint">عند تغيير منفذ الإدارة أو المسار، افتح الرابط الجديد من أي جهاز على نفس الشبكة.</span>
            </div>
            <div className="grid grid-2">
              <label className="card card-pad" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <input type="checkbox" checked={form.autoStartOnBoot !== "false"} onChange={setBool("autoStartOnBoot")} />
                <span>
                  <strong>تشغيل بعد تسجيل الدخول</strong>
                  <span className="hint" style={{ display: "block" }}>يفتح WIVA تلقائياً بعد دخول مستخدم ويندوز.</span>
                </span>
              </label>
              <label className="card card-pad" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <input type="checkbox" checked={form.autoStartBeforeLogin === "true"} onChange={setBool("autoStartBeforeLogin")} />
                <span>
                  <strong>تشغيل قبل تسجيل الدخول</strong>
                  <span className="hint" style={{ display: "block" }}>
                    ويندوز فقط. يشغل الوكيل والسيرفر عند تشغيل الجهاز وقد يحتاج صلاحية مدير أول مرة.
                  </span>
                </span>
              </label>
            </div>
            {query.data?.autoStart ? (
              <div className="notice">
                حالة التشغيل قبل الدخول: {query.data.autoStart.beforeLoginInstalled ? "مفعلة" : "غير مفعلة"}
                {query.data.autoStart.error ? ` - ${query.data.autoStart.error}` : ""}
              </div>
            ) : null}
            <div className="row">
              <button className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
              </button>
              {save.isSuccess ? <span className="badge badge-on badge-dot">تم الحفظ</span> : null}
              {save.isError ? <span className="badge badge-warn">{(save.error as Error).message}</span> : null}
            </div>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
