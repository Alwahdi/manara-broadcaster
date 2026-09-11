import { SetupStep } from "@/components/SetupStep";

export function SetupIptv() {
  return (
    <SetupStep
      title="قنوات IPTV"
      subtitle="استورد القنوات بعد حفظ إعداد الشبكة وتسجيل دخول المشرف."
      prev="/setup/ports"
      next="/setup/finish"
      nextLabel="مراجعة الإعداد"
    >
      <div className="card card-pad">
        <p>من لوحة الإدارة، افتح «قنوات IPTV» ثم «استيراد». عاين القائمة واختر القنوات قبل إضافتها.</p>
        <p className="hint">لم تُستورد أي قنوات في معالج الإعداد. استخدم فقط القوائم التي تملك صلاحية بثها.</p>
      </div>
    </SetupStep>
  );
}
