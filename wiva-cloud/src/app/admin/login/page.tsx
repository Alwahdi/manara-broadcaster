import { LockKeyhole, ServerCog, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { LoginForm } from "@/components/LoginForm";

export default function AdminLoginPage() {
  return <div className="auth-page"><section className="auth-promo"><BrandMark /><div className="auth-promo-content"><span className="eyebrow"><i /> WIVA Operations</span><h1>تحكم هادئ.<br />تشغيل واضح.</h1><p>إدارة المصادر المرخّصة، القنوات، المشاهدين وصحة بوابة الوسائط من مكان واحد.</p><div className="auth-benefits"><span><LockKeyhole />أسرار مشفّرة</span><span><ServerCog />تبديل المزوّدين</span><span><ShieldCheck />سجل تدقيق وحقوق توزيع</span></div></div></section><section className="auth-panel"><div className="auth-card"><h2>دخول الإدارة</h2><p>لا توجد بيانات افتراضية. يجب ضبط الحساب من متغيرات Vercel.</p><LoginForm admin /></div></section></div>;
}
