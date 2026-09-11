import { SetupStep } from "@/components/SetupStep";

export function SetupLibrary() {
  return (
    <SetupStep
      title="مكتبة الوسائط"
      subtitle="تُضاف مصادر الوسائط بعد حفظ إعداد الشبكة وتسجيل دخول المشرف."
      prev="/setup/ports"
      next="/setup/finish"
      nextLabel="مراجعة الإعداد"
    >
      <div className="card card-pad">
        <p>من لوحة الإدارة، افتح «مصادر التخزين»، اختر المجلد، ثم افحص المصدر ليظهر محتواه في المكتبة.</p>
        <p className="hint">لم تُضف أي مصادر في معالج الإعداد. إدارة المصادر تتطلب تسجيل دخول المشرف.</p>
      </div>
    </SetupStep>
  );
}
