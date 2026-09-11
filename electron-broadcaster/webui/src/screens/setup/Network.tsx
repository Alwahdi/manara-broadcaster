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
      nextDisabled={!data.networkName?.trim()}
    >
      <div className="card card-pad">
        <div className="field">
          <label htmlFor="setup-network">اسم الشبكة *</label>
          <input id="setup-network" className="input" value={data.networkName || ""} onChange={(e) => setSetup({ networkName: e.target.value })} placeholder="مثال: شبكة الفندق" />
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="setup-country">الدولة</label>
            <input id="setup-country" className="input" value={data.country || ""} onChange={(e) => setSetup({ country: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="setup-city">المدينة</label>
            <input id="setup-city" className="input" value={data.city || ""} onChange={(e) => setSetup({ city: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="setup-timezone">المنطقة الزمنية</label>
          <input id="setup-timezone" className="input mono" dir="ltr" value={data.timezone || ""} onChange={(e) => setSetup({ timezone: e.target.value })} placeholder="Asia/Riyadh" />
        </div>
      </div>
    </SetupStep>
  );
}
