import { SetupStep } from "@/components/SetupStep";
import { useSetup, setSetup } from "@/hooks/useSetup";

export function SetupBranding() {
  const data = useSetup();
  const readLogo = (file?: File) => {
    if (!file) return;
    if (file.type !== "image/png") {
      window.alert("الرجاء اختيار صورة PNG فقط.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setSetup({ networkLogoDataUrl: String(reader.result || "") });
    reader.readAsDataURL(file);
  };
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
        <div className="field">
          <label>شعار الشبكة PNG</label>
          <input className="input" type="file" accept="image/png" onChange={(e) => readLogo(e.target.files?.[0])} />
          {data.networkLogoDataUrl ? (
            <div className="brand-preview">
              <img src={data.networkLogoDataUrl} alt="" />
              <button className="btn btn-sm btn-ghost" type="button" onClick={() => setSetup({ networkLogoDataUrl: "" })}>
                إزالة الشعار
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </SetupStep>
  );
}
