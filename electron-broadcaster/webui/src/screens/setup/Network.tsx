import { SetupStep } from "@/components/SetupStep";
import { useSetup, setSetup } from "@/hooks/useSetup";

export function SetupNetwork() {
  const data = useSetup();
  return (
    <SetupStep
      title="بيانات الشبكة"
      subtitle="عرّف شبكتك المحلية."
      prev="/setup/welcome"
      next="/setup/admin-account"
      nextDisabled={!data.networkName}
    >
      <div className="card card-pad">
        <div className="field">
          <label>اسم الشبكة *</label>
          <input className="input" value={data.networkName || ""} onChange={(e) => setSetup({ networkName: e.target.value })} placeholder="مثال: شبكة الفندق" />
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label>الدولة</label>
            <input className="input" value={data.country || ""} onChange={(e) => setSetup({ country: e.target.value })} />
          </div>
          <div className="field">
            <label>المدينة</label>
            <input className="input" value={data.city || ""} onChange={(e) => setSetup({ city: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>المنطقة الزمنية</label>
          <input className="input mono" dir="ltr" value={data.timezone || ""} onChange={(e) => setSetup({ timezone: e.target.value })} placeholder="Asia/Riyadh" />
        </div>
      </div>
    </SetupStep>
  );
}
