import { CheckCircle2, Globe2, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { LoginForm } from "@/components/LoginForm";
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="auth-page">
      <section className="auth-promo"><BrandMark /><div className="auth-promo-content"><span className="eyebrow"><i /> حساب مشاهدة شخصي</span><h1>شاهد أينما كنت.</h1><p>سجّل الدخول من 4G أو Wi‑Fi واستكمل مشاهدة القنوات والأفلام والمسلسلات على كل أجهزتك.</p><div className="auth-benefits"><span><ShieldCheck />حسابك محمي</span><span><Globe2 />متجاوب مع كل الأجهزة</span><span><CheckCircle2 />حالة اشتراك واضحة</span></div></div></section>
      <section className="auth-panel"><div className="auth-card"><h2>تسجيل الدخول</h2><p>أدخل بيانات حسابك لمتابعة المشاهدة.</p><LoginForm /><p className="auth-switch">ليس لديك حساب؟ <Link href="/signup">ابدأ 3 أيام مجانًا</Link></p></div></section>
    </div>
  );
}
