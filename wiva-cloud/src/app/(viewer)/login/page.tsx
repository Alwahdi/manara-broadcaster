import { CheckCircle2, Globe2, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="auth-page">
      <section className="auth-promo"><BrandMark /><div className="auth-promo-content"><span className="eyebrow"><i /> حساب مشاهدة شخصي</span><h1>شاهد أينما كنت.</h1><p>سجّل الدخول من 4G أو Wi‑Fi واستكمل مشاهدة المحتوى المتاح لحسابك مع حماية الجلسة وروابط قصيرة العمر.</p><div className="auth-benefits"><span><ShieldCheck />لا تظهر بيانات المزوّد</span><span><Globe2 />متجاوب مع كل الأجهزة</span><span><CheckCircle2 />صلاحيات وحالة اشتراك واضحة</span></div></div></section>
      <section className="auth-panel"><div className="auth-card"><h2>تسجيل الدخول</h2><p>أدخل حساب المشاهد الذي أنشأه مدير WIVA.</p><LoginForm /></div></section>
    </div>
  );
}
