import { SetupStep } from "@/components/SetupStep";
import { useSetup, setSetup } from "@/hooks/useSetup";

export function SetupBranding() {
  const data = useSetup();
  return (
    <SetupStep
      title="الهوية"
      subtitle="اسم العلامة الظاهر للمشاهدين."
      prev="/setup/admin-account"
      next="/setup/ports"
    >
      <div className="card card-pad">
        <div className="field">
          <label>اسم العلامة</label>
          <input className="input" value={data.brandName || ""} onChange={(e) => setSetup({ brandName: e.target.value })} placeholder={data.networkName || "اسم الشبكة"} />
          <span className="hint">إن تُرك فارغًا، سيُستخدم اسم الشبكة.</span>
        </div>
      </div>
    </SetupStep>
  );
}
