import { SetupStep } from "@/components/SetupStep";
import { useSetup, setSetup } from "@/hooks/useSetup";
import { parsePortInput } from "@/lib/format";

export function SetupPorts() {
  const data = useSetup();
  const live = parsePortInput(data.livePort?.trim() || "8787");
  const admin = parsePortInput(data.adminPort?.trim() || "8788");
  const error = !Number.isFinite(live) || !Number.isFinite(admin)
    ? "أدخل رقم منفذ صحيحًا بين 1 و65535."
    : data.experienceLayout === "separate" && live === admin
      ? "يجب أن يختلف منفذ البث عن منفذ الإدارة في الوضع المنفصل."
      : "";
  return (
    <SetupStep
      title="المنافذ والمسارات"
      subtitle="منافذ الخدمة ومسار لوحة الإدارة."
      prev="/setup/branding"
      next="/setup/finish"
      nextDisabled={!!error}
    >
      <div className="card card-pad">
        <div className="field">
          <label htmlFor="setup-layout">طريقة العرض</label>
          <select
            id="setup-layout"
            className="input"
            value={data.experienceLayout || "unified"}
            onChange={(e) => setSetup({ experienceLayout: e.target.value })}
          >
            <option value="unified">موحدة: رابط واحد للبث والمكتبة والإدارة</option>
            <option value="separate">منفصلة: البث على منفذ والمكتبة والإدارة على منفذ آخر</option>
          </select>
          <span className="hint">يمكن تغيير هذا لاحقاً من لوحة الإدارة.</span>
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="setup-live-port">منفذ البث المباشر</label>
            <input id="setup-live-port" className="input mono" dir="ltr" inputMode="numeric" aria-invalid={!!error} aria-describedby={error ? "setup-port-error" : undefined} value={data.livePort || ""} onChange={(e) => setSetup({ livePort: e.target.value })} placeholder="8787" />
          </div>
          <div className="field">
            <label htmlFor="setup-admin-port">منفذ الإدارة والمكتبة</label>
            <input id="setup-admin-port" className="input mono" dir="ltr" inputMode="numeric" aria-invalid={!!error} aria-describedby={error ? "setup-port-error" : undefined} value={data.adminPort || ""} onChange={(e) => setSetup({ adminPort: e.target.value })} placeholder="8788" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="setup-admin-path">مسار لوحة الإدارة</label>
          <input id="setup-admin-path" className="input mono" dir="ltr" value={data.adminPath || ""} onChange={(e) => setSetup({ adminPath: e.target.value })} placeholder="admin" />
          <span className="hint">يمكن تخصيص المسار لزيادة الخصوصية داخل الشبكة.</span>
        </div>
        {error ? <p id="setup-port-error" className="form-error" role="alert">{error}</p> : null}
      </div>
    </SetupStep>
  );
}
