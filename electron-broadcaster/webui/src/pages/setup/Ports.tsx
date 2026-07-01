import { SetupStep } from "@/components/SetupStep";
import { useSetup, setSetup } from "@/hooks/useSetup";

export function SetupPorts() {
  const data = useSetup();
  return (
    <SetupStep
      title="المنافذ والمسارات"
      subtitle="منافذ الخدمة ومسار لوحة الإدارة."
      prev="/setup/branding"
      next="/setup/library"
    >
      <div className="card card-pad">
        <div className="grid grid-2">
          <div className="field">
            <label>منفذ البث المباشر</label>
            <input className="input mono" dir="ltr" value={data.livePort || ""} onChange={(e) => setSetup({ livePort: e.target.value })} placeholder="8787" />
          </div>
          <div className="field">
            <label>منفذ الإدارة والمكتبة</label>
            <input className="input mono" dir="ltr" value={data.adminPort || ""} onChange={(e) => setSetup({ adminPort: e.target.value })} placeholder="8788" />
          </div>
        </div>
        <div className="field">
          <label>مسار لوحة الإدارة</label>
          <input className="input mono" dir="ltr" value={data.adminPath || ""} onChange={(e) => setSetup({ adminPath: e.target.value })} placeholder="admin" />
          <span className="hint">يمكن تخصيص المسار لزيادة الخصوصية داخل الشبكة.</span>
        </div>
      </div>
    </SetupStep>
  );
}
