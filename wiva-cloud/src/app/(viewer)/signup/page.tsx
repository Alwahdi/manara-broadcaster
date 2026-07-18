import Link from "next/link";
import { CheckCircle2, CreditCard, PlayCircle } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { SignupForm } from "@/components/SignupForm";

export default function SignupPage() {
  return <div className="auth-page viewer-auth-page">
    <section className="auth-promo"><BrandMark /><div className="auth-promo-content"><span className="eyebrow"><i /> تجربة مجانية</span><h1>ابدأ المشاهدة<br />خلال لحظات.</h1><p>ثلاثة أيام مجانية على جهاز واحد. بعد التجربة يمكنك إرسال طلب تجديد من حسابك.</p><div className="auth-benefits"><span><PlayCircle />تشغيل مباشر بعد التسجيل</span><span><CheckCircle2 />لا توجد رسوم تلقائية</span><span><CreditCard />تجديد بتحويل يدوي ومراجعة الإدارة</span></div></div></section>
    <section className="auth-panel"><div className="auth-card"><h2>إنشاء حساب</h2><p>لن نخصم أي مبلغ تلقائيًا بعد انتهاء التجربة.</p><SignupForm /><p className="auth-switch">لديك حساب؟ <Link href="/login">تسجيل الدخول</Link></p></div></section>
  </div>;
}
