import { ShieldCheck } from "lucide-react";

export default function PrivacyPage() {
  return <div className="container policy-page"><header><ShieldCheck /><span><h1>الخصوصية</h1><p>كيف تحمي WIVA بيانات حسابك ومشاهدتك.</p></span></header><section><h2>البيانات التي نحفظها</h2><p>نحفظ بيانات الحساب، الأجهزة المسجّلة، المفضلة، وموضع المشاهدة لتقديم الخدمة ومزامنتها بين أجهزتك.</p><h2>الحماية</h2><p>كلمات المرور مشفّرة ولا نخزنها كنص واضح. بيانات مزودي المحتوى لا تظهر للمشاهدين.</p><h2>التحكم</h2><p>يمكنك تسجيل خروج الأجهزة الأخرى وتغيير كلمة المرور من صفحة حسابك. تواصل مع إدارة الخدمة لطلب حذف الحساب.</p></section></div>;
}
