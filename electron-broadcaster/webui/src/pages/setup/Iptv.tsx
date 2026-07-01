import { SetupStep } from "@/components/SetupStep";
import { useSetup, setSetup } from "@/hooks/useSetup";

export function SetupIptv() {
  const data = useSetup();
  return (
    <SetupStep
      title="قنوات IPTV"
      subtitle="أضف رابط قائمة M3U (اختياري)."
      prev="/setup/library"
      next="/setup/finish"
    >
      <div className="card card-pad">
        <div className="field">
          <label>رابط قائمة M3U</label>
          <input className="input mono" dir="ltr" value={data.iptvUrl || ""} onChange={(e) => setSetup({ iptvUrl: e.target.value })} placeholder="http://…/playlist.m3u" />
          <span className="hint">يمكنك إضافة القوائم واستيرادها لاحقًا من لوحة الإدارة.</span>
        </div>
      </div>
    </SetupStep>
  );
}
