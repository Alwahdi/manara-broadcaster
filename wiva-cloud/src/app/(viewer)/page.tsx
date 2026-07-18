import Link from "next/link";
import { ArrowLeft, CirclePlay, Globe2, Radio, ShieldCheck, Sparkles } from "lucide-react";
import { CatalogSection } from "@/components/Section";
import { listAssets } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const assets = await listAssets();
  const live = assets.filter((asset) => asset.kind === "live").slice(0, 5);
  const movies = assets.filter((asset) => asset.kind === "movie").slice(0, 5);
  const series = assets.filter((asset) => asset.kind === "series").slice(0, 5);
  return (
    <>
      <section className="hero">
        <div className="container hero-content">
          <span className="eyebrow"><i /> منصة مشاهدة مرخّصة وآمنة</span>
          <h1>كل شاشتك في <span>مكان واحد.</span></h1>
          <p>قنوات مباشرة، أفلام ومسلسلات بتجربة عربية سريعة على الجوال والتلفزيون والمتصفح، مع حماية الحساب وإخفاء مصادر البث.</p>
          <div className="hero-actions">
            <Link href="/live" className="button primary"><CirclePlay size={20} />ابدأ المشاهدة</Link>
            <Link href="/movies" className="button secondary">استكشف المكتبة <ArrowLeft size={18} /></Link>
          </div>
          <div className="hero-stats">
            <div><strong>Single ingest</strong><span>مصدر واحد لكل قناة وجودة</span></div>
            <div><strong>CDN ready</strong><span>توزيع عالمي للمشاهدين</span></div>
            <div><strong>RTL first</strong><span>واجهة عربية متجاوبة</span></div>
          </div>
        </div>
      </section>
      <CatalogSection title="البث المباشر" description="قنواتك المفعّلة مرتبة وواضحة" href="/live" assets={live} />
      <CatalogSection title="أفلام مختارة" description="أحدث الإضافات من المصادر المرخّصة" href="/movies" assets={movies} />
      <CatalogSection title="مسلسلات" description="حلقاتك في تجربة مشاهدة واحدة" href="/series" assets={series} />
      <section className="container catalog-section">
        <div className="architecture-card">
          <div className="section-heading"><div><h2>بنية مشاهدة مصممة للنمو</h2><p>فصل واضح بين التحكم والبث الفعلي.</p></div></div>
          <div className="architecture-flow">
            <div><ShieldCheck /><strong>حسابات وصلاحيات</strong><span>جلسات آمنة وروابط تشغيل قصيرة العمر.</span></div>
            <div><Radio /><strong>بوابة وسائط</strong><span>سحب عند الطلب ومشاركة الإدخال نفسه.</span></div>
            <div><Globe2 /><strong>شبكة CDN</strong><span>توزيع المقاطع بدل فتح آلاف الاتصالات على الأصل.</span></div>
            <div><Sparkles /><strong>تجربة WIVA</strong><span>واجهة هادئة وسريعة لكل حجم شاشة.</span></div>
          </div>
        </div>
      </section>
    </>
  );
}
