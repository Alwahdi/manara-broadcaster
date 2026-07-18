import Link from "next/link";
import { Clapperboard, Film, Radio, Search } from "lucide-react";
import { CatalogSection } from "@/components/Section";
import { listViewerAssets } from "@/lib/db";

export const revalidate = 20;

export default async function HomePage() {
  const [live, movies, series] = await Promise.all([
    listViewerAssets("live"), listViewerAssets("movie"), listViewerAssets("series"),
  ]);
  return (
    <>
      <section className="app-home container">
        <header className="app-home-heading">
          <div><span>مرحبًا بك</span><h1>ماذا تريد أن تشاهد؟</h1></div>
          <Link href="/search" className="icon-button" aria-label="البحث في المحتوى"><Search size={20} /></Link>
        </header>
        <div className="home-destinations" aria-label="أقسام المشاهدة">
          <Link href="/live" className="home-destination live"><span><Radio /></span><strong>البث المباشر</strong><small>اختر قناة</small></Link>
          <Link href="/movies" className="home-destination"><span><Film /></span><strong>الأفلام</strong><small>تصفح الأفلام</small></Link>
          <Link href="/series" className="home-destination"><span><Clapperboard /></span><strong>المسلسلات</strong><small>تصفح المسلسلات</small></Link>
        </div>
      </section>
      <CatalogSection title="على الهواء الآن" description="اختر قناة وابدأ المشاهدة" href="/live" assets={live} />
      <CatalogSection title="أفلام" description="جاهزة للمشاهدة" href="/movies" assets={movies} />
      <CatalogSection title="مسلسلات" description="اختر الموسم والحلقة" href="/series" assets={series} />
    </>
  );
}
