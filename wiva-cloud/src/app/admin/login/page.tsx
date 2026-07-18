import { LockKeyhole, ServerCog, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { LoginForm } from "@/components/LoginForm";

export default function AdminLoginPage() {
  return <div className="auth-page admin-auth-page"><section className="auth-promo"><BrandMark /><div className="auth-promo-content"><span className="eyebrow"><i /> إدارة WIVA</span><h1>تحكم هادئ.<br />تشغيل واضح.</h1><p>إدارة المصادر المرخّصة والمحتوى والمشاهدين من مكان واحد.</p><div className="auth-benefits"><span><LockKeyhole />بيانات محمية</span><span><ServerCog />إدارة سهلة للمزوّدين</span><span><ShieldCheck />متابعة واضحة للصلاحيات</span></div></div></section><section className="auth-panel"><div className="auth-card"><div className="auth-card-brand"><BrandMark compact /></div><h2>دخول الإدارة</h2><p>أدخل حساب الإدارة الخاص بك للمتابعة.</p><LoginForm admin /></div></section></div>;
}
