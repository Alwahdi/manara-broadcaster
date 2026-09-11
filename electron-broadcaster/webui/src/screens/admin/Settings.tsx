import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { PageHeader } from "@/components/common";
import { useBrand } from "@/hooks/useBrand";
import { parsePortInput } from "@/lib/format";
import { useFormDraft } from "@/hooks/useFormDraft";

export function AdminSettings() {
  const { query } = useBrand();
  const qc = useQueryClient();
  const draft = useFormDraft("settings", query.data ? {
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
  } : undefined);
  const { values: form, setValues: setForm } = draft;
  const port = parsePortInput(form.port || "");
  const libraryPort = parsePortInput(form.libraryPort || "");
  const portError = !Number.isFinite(port) || !Number.isFinite(libraryPort)
    ? "أدخل رقم منفذ صحيحًا بين 1 و65535."
    : form.experienceLayout === "separate" && port === libraryPort
      ? "يجب أن يختلف منفذ البث عن منفذ الإدارة في الوضع المنفصل."
      : "";
  const update = useQuery({
    queryKey: ["app-update"],
    queryFn: api.updateStatus,
    refetchInterval: (query) => ["checking", "downloading"].includes(String(query.state.data?.update?.state || "")) ? 1500 : false,
  });

  const save = useMutation({
    mutationFn: () => {
      if (portError) throw new Error(portError);
      return api.saveSettings({
        ...form,
        networkCountry: form.country,
        networkCity: form.city,
        networkTimezone: form.timezone,
        port,
        libraryPort,
        experienceLayout: form.experienceLayout === "separate" ? "separate" : "unified",
        autoStartOnBoot: form.autoStartOnBoot === "true",
        autoStartBeforeLogin: form.autoStartBeforeLogin === "true",
      });
    },
    onSuccess: () => {
      draft.accept();
      return qc.invalidateQueries({ queryKey: ["agent-state"] });
    },
  });
  const updateAction = useMutation({
    mutationFn: (action: "check" | "download" | "install") => {
      if (action === "download") return api.downloadUpdate();
      if (action === "install") return api.installUpdate();
      return api.checkUpdate();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-update"] });
      qc.invalidateQueries({ queryKey: ["agent-state"] });
    },
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
          <form className="card card-pad" onSubmit={(event) => { event.preventDefault(); if (!save.isPending && !portError) save.mutate(); }}>
            <fieldset className="form-fields" disabled={save.isPending}>
            <div className="field">
              <label htmlFor="settings-network">اسم الشبكة</label>
              <input id="settings-network" className="input" value={form.networkName || ""} onChange={set("networkName")} />
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="settings-country">الدولة</label>
                <input id="settings-country" className="input" value={form.country || ""} onChange={set("country")} />
              </div>
              <div className="field">
                <label htmlFor="settings-city">المدينة</label>
                <input id="settings-city" className="input" value={form.city || ""} onChange={set("city")} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="settings-timezone">المنطقة الزمنية</label>
              <input id="settings-timezone" className="input mono" dir="ltr" value={form.timezone || ""} onChange={set("timezone")} placeholder="Asia/Riyadh" />
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="settings-port">منفذ البث المباشر</label>
                <input id="settings-port" className="input mono" dir="ltr" inputMode="numeric" aria-invalid={!!portError} aria-describedby={portError ? "settings-port-error" : undefined} value={form.port || ""} onChange={set("port")} placeholder="8787" />
              </div>
              <div className="field">
                <label htmlFor="settings-library-port">منفذ الإدارة والمكتبة</label>
                <input id="settings-library-port" className="input mono" dir="ltr" inputMode="numeric" aria-invalid={!!portError} aria-describedby={portError ? "settings-port-error" : undefined} value={form.libraryPort || ""} onChange={set("libraryPort")} placeholder="8788" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="settings-layout">طريقة عرض الخدمة</label>
              <select id="settings-layout" className="input" value={form.experienceLayout || "unified"} onChange={set("experienceLayout")}>
                <option value="unified">موحدة: البث والمكتبة والإدارة على منفذ البث</option>
                <option value="separate">منفصلة: البث على منفذ والمكتبة والإدارة على منفذ آخر</option>
              </select>
              <span className="hint">
                في الوضع الموحد استخدم رابط البث نفسه للمكتبة والإدارة. في الوضع المنفصل استخدم منفذ الإدارة والمكتبة.
              </span>
            </div>
            <div className="field">
              <label htmlFor="settings-admin-path">مسار لوحة الإدارة</label>
              <input id="settings-admin-path" className="input mono" dir="ltr" value={form.adminPath || ""} onChange={set("adminPath")} placeholder="admin" />
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
                التشغيل بعد الدخول: {query.data.autoStart.afterLoginRegistered ? "مسجل في النظام" : "غير مسجل"}
                {" · "}
                التشغيل قبل الدخول: {query.data.autoStart.beforeLoginInstalled ? "مفعلة" : "غير مفعلة"}
                {query.data.autoStart.error ? ` - ${query.data.autoStart.error}` : ""}
              </div>
            ) : null}
            <div className="row">
              <button type="submit" className="btn btn-primary" disabled={save.isPending || !!portError}>
                {save.isPending ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
              </button>
              <button type="button" className="btn btn-ghost" disabled={!draft.dirty || save.isPending} onClick={() => {
                if (window.confirm("تجاهل التغييرات غير المحفوظة؟")) { draft.discard(); save.reset(); }
              }}>تجاهل التغييرات</button>
              {draft.dirty ? <span role="status" className="badge badge-warn">تغييرات غير محفوظة</span>
                : save.isSuccess ? <span role="status" className="badge badge-on badge-dot">تم الحفظ</span> : null}
              {save.isError ? <span role="alert" className="badge badge-warn">{(save.error as Error).message}</span> : null}
            </div>
            {portError ? <p id="settings-port-error" role="alert" className="form-error">{portError}</p> : null}
            {draft.changedElsewhere ? <p role="status" className="notice">تغيّرت الإعدادات على الخادم. احتفظنا بمسودتك؛ راجعها قبل الحفظ أو تجاهلها لتحميل القيم الحالية.</p> : null}
            </fieldset>
          </form>
        )}
      </QueryBoundary>
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>تحديث البرنامج</h2>
        <p className="hint">تحقق من النسخة الجديدة وحمّلها وثبّتها من هذه الصفحة. ستتم إعادة تشغيل WIVA عند بدء التثبيت.</p>
        {update.isLoading ? <div className="skeleton" style={{ height: 72 }} /> : (
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>الإصدار الحالي: {update.data?.update?.currentVersion || query.data?.version || "—"}</strong>
              <span className="hint" style={{ display: "block" }}>
                {update.data?.update?.state === "ready" ? `الإصدار ${update.data.update.version || "الجديد"} جاهز للتثبيت`
                  : update.data?.update?.state === "downloading" ? `جارٍ التحميل ${Math.round(Number(update.data.update.percent) || 0)}%`
                    : update.data?.update?.state === "available" ? `يتوفر الإصدار ${update.data.update.version || "الجديد"}`
                      : update.data?.update?.state === "checking" ? "جارٍ التحقق من التحديثات…"
                        : update.data?.update?.state === "none" ? "لديك أحدث إصدار"
                          : update.data?.update?.state === "error" ? (update.data.update.message || "تعذر التحقق من التحديث")
                            : "التحديث التلقائي مفعّل للإصدارات المثبتة"}
              </span>
            </div>
            <div className="row">
              <button className="btn" disabled={updateAction.isPending} onClick={() => updateAction.mutate("check")}>التحقق الآن</button>
              {update.data?.update?.state === "available" ? (
                <button className="btn btn-primary" disabled={updateAction.isPending} onClick={() => updateAction.mutate("download")}>تحميل التحديث</button>
              ) : null}
              {update.data?.update?.state === "ready" ? (
                <button className="btn btn-primary" disabled={updateAction.isPending} onClick={() => updateAction.mutate("install")}>تثبيت وإعادة التشغيل</button>
              ) : null}
            </div>
          </div>
        )}
        {updateAction.data && !updateAction.data.ok ? <div className="notice notice-error" style={{ marginTop: 12 }}>{updateAction.data.error || "تعذر تنفيذ التحديث."}</div> : null}
        {updateAction.isError ? <div className="notice notice-error" style={{ marginTop: 12 }}>{(updateAction.error as Error).message}</div> : null}
      </div>
    </div>
  );
}
