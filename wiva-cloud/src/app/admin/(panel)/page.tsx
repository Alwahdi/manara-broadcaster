import { Clapperboard, Globe2, Radio, ServerCog, TriangleAlert, UsersRound } from "lucide-react";
import { dashboardCounts } from "@/lib/db";
import { databaseConfigured, isDemoMode } from "@/lib/env";
import { requireAdminPage } from "@/lib/auth";

export default async function AdminDashboard() {
  await requireAdminPage();
  const counts = await dashboardCounts();
  return <><header className="admin-page-heading"><div><h1>نظرة عامة</h1><p>حالة منصة المشاهدة ومكوّنات التشغيل.</p></div></header>{!databaseConfigured() ? <div className="notice-banner"><TriangleAlert size={19} /><span>{isDemoMode() ? "المنصة تعمل بوضع العرض. عمليات الإدارة الحقيقية مقفلة حتى إعداد Neon والأسرار." : "قاعدة البيانات غير مهيأة؛ المنصة تفشل مغلقة ولن تسمح بالتشغيل."}</span></div> : null}<section className="stats-grid"><div className="stat-card"><span><Clapperboard /></span><strong>{counts.assets}</strong><small>إجمالي العناصر</small></div><div className="stat-card"><span><Radio /></span><strong>{counts.live}</strong><small>قنوات مباشرة</small></div><div className="stat-card"><span><ServerCog /></span><strong>{counts.providers}</strong><small>مزوّدون</small></div><div className="stat-card"><span><UsersRound /></span><strong>{counts.viewers}</strong><small>حسابات مشاهدين</small></div></section><section className="architecture-card"><div className="ops-card-heading"><div><Globe2 /><span><h2>مسار البث</h2><p>Vercel للتحكم، خادم دائم للإدخال، وCDN للمشاهدين.</p></span></div></div><div className="architecture-flow"><div><strong>1. Next.js</strong><span>تحقق الحساب وصلاحية العنصر.</span></div><div><strong>2. Signed grant</strong><span>رابط قصير العمر لا يكشف المصدر.</span></div><div><strong>3. Media gateway</strong><span>إدخال واحد للقناة والجودة النشطة.</span></div><div><strong>4. CDN</strong><span>توزيع HLS على أعداد كبيرة.</span></div></div></section></>;
}
