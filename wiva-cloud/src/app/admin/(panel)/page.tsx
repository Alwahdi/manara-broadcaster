import { Clapperboard, Globe2, Radio, ServerCog, TriangleAlert, UsersRound } from "lucide-react";
import { dashboardCounts } from "@/lib/db";
import { databaseConfigured, isDemoMode } from "@/lib/env";
import { requireAdminPage } from "@/lib/auth";

export default async function AdminDashboard() {
  await requireAdminPage();
  const counts = await dashboardCounts();
  return <><header className="admin-page-heading"><div><h1>نظرة عامة</h1><p>ملخّص المحتوى والمشاهدين وحالة المنصة.</p></div></header>{!databaseConfigured() ? <div className="notice-banner"><TriangleAlert size={19} /><span>{isDemoMode() ? "المنصة تعمل بوضع العرض، لذلك لا يمكن حفظ تغييرات حقيقية الآن." : "التخزين غير جاهز الآن؛ أوقفنا التشغيل لحماية بيانات المنصة."}</span></div> : null}<section className="stats-grid"><div className="stat-card"><span><Clapperboard /></span><strong>{counts.assets}</strong><small>إجمالي العناصر</small></div><div className="stat-card"><span><Radio /></span><strong>{counts.live}</strong><small>قنوات مباشرة</small></div><div className="stat-card"><span><ServerCog /></span><strong>{counts.providers}</strong><small>مزوّدون</small></div><div className="stat-card"><span><UsersRound /></span><strong>{counts.viewers}</strong><small>حسابات مشاهدين</small></div></section><section className="architecture-card"><div className="ops-card-heading"><div><Globe2 /><span><h2>كيف يصل المحتوى إلى المشاهد؟</h2><p>أربع خطوات تلقائية وآمنة من اختيار المحتوى حتى تشغيله.</p></span></div></div><div className="architecture-flow"><div><strong>1. التحقق من الحساب</strong><span>نتأكد من أن المشاهد مخوّل للمشاهدة.</span></div><div><strong>2. تأكيد صلاحية المحتوى</strong><span>لا يظهر إلا المحتوى المنشور من مزوّد نشط.</span></div><div><strong>3. تجهيز البث</strong><span>يُجهّز المصدر عند بدء المشاهدة فقط.</span></div><div><strong>4. العرض للمشاهدين</strong><span>يصل البث دون كشف بيانات المزوّد.</span></div></div></section></>;
}
