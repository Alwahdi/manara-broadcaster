import Link from "next/link";
import { ArrowLeft, CirclePlay, Globe2, Radio, ShieldCheck, Sparkles } from "lucide-react";
import { CatalogSection } from "@/components/Section";
import { listViewerAssets } from "@/lib/db";

export const revalidate = 20;

export default async function HomePage() {
  const [live, movies, series] = await Promise.all([
    listViewerAssets("live"), listViewerAssets("movie"), listViewerAssets("series"),
  ]);
  return (
    <>
      <section className="hero">
        <div className="container hero-content">
          <span className="eyebrow"><i /> مشاهدة سهلة وآمنة</span>
          <h1>كل شاشتك في <span>مكان واحد.</span></h1>
          <p>قنوات مباشرة، أفلام ومسلسلات بتجربة عربية سريعة وسهلة على الجوال والتلفزيون والمتصفح.</p>
          <div className="hero-actions">
            <Link href="/live" className="button primary"><CirclePlay size={20} />ابدأ المشاهدة</Link>
            <Link href="/movies" className="button secondary">استكشف المكتبة <ArrowLeft size={18} /></Link>
          </div>
          <div className="hero-stats">
            <div><strong>تشغيل سريع</strong><span>ابدأ المشاهدة خلال لحظات</span></div>
            <div><strong>كل الأجهزة</strong><span>جوال وتلفزيون ومتصفح</span></div>
            <div><strong>تجربة عربية</strong><span>واجهة واضحة ومتجاوبة</span></div>
          </div>
        </div>
      </section>
      <CatalogSection title="البث المباشر" description="قنواتك المتاحة مرتبة وواضحة" href="/live" assets={live} />
      <CatalogSection title="أفلام مختارة" description="أحدث الأفلام المتاحة للمشاهدة" href="/movies" assets={movies} />
      <CatalogSection title="مسلسلات" description="حلقاتك في تجربة مشاهدة واحدة" href="/series" assets={series} />
      <section className="container catalog-section">
        <div className="architecture-card">
          <div className="section-heading"><div><h2>لماذا WIVA؟</h2><p>كل ما تحتاجه للمشاهدة في تجربة واحدة بسيطة.</p></div></div>
          <div className="architecture-flow">
            <div><ShieldCheck /><strong>حساب آمن</strong><span>مشاهدتك وبيانات حسابك محمية.</span></div>
            <div><Radio /><strong>بث سلس</strong><span>تشغيل مستقر وسريع للقنوات.</span></div>
            <div><Globe2 /><strong>شاهد أينما كنت</strong><span>عبر Wi‑Fi أو شبكة الجوال.</span></div>
            <div><Sparkles /><strong>تجربة WIVA</strong><span>واجهة هادئة وسريعة لكل حجم شاشة.</span></div>
          </div>
        </div>
      </section>
    </>
  );
}
