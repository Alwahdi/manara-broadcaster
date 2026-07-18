import Link from "next/link";
import { Clapperboard, Film, Radio } from "lucide-react";
import { CatalogSection, EmptyState } from "@/components/Section";
import { MatchScheduleSection } from "@/components/MatchScheduleSection";
import { listViewerAssets } from "@/lib/db";
import { listContinueWatching, listPublicMatchSchedule, listViewerFavorites } from "@/lib/db";
import { currentViewerAccount } from "@/lib/auth";

export const revalidate = 20;

export default async function HomePage() {
  const viewerPromise = currentViewerAccount();
  const [viewer, live, movies, series, continueWatching, favorites, matchSchedule] = await Promise.all([
    viewerPromise,
    listViewerAssets("live"), listViewerAssets("movie"), listViewerAssets("series"),
    viewerPromise.then((account) => account ? listContinueWatching(account.id) : []),
    viewerPromise.then((account) => account ? listViewerFavorites(account.id) : []),
    listPublicMatchSchedule(),
  ]);
  return (
    <>
      <section className="app-home container">
        <header className="app-home-heading">
          <div><span>{viewer ? `مرحبًا ${viewer.name}` : "مرحبًا بك"}</span><h1>ماذا تريد أن تشاهد؟</h1></div>
        </header>
        <div className="home-destinations" aria-label="أقسام المشاهدة">
          <Link href="/live" className="home-destination live"><span><Radio /></span><strong>البث المباشر</strong><small>اختر قناة</small></Link>
          <Link href="/movies" className="home-destination"><span><Film /></span><strong>الأفلام</strong><small>تصفح الأفلام</small></Link>
          <Link href="/series" className="home-destination"><span><Clapperboard /></span><strong>المسلسلات</strong><small>تصفح المسلسلات</small></Link>
        </div>
      </section>
      <MatchScheduleSection matches={matchSchedule} />
      {continueWatching.length ? <CatalogSection title="تابع المشاهدة" description="أكمل من حيث توقفت" href="/account" assets={continueWatching} /> : null}
      {favorites.length ? <CatalogSection title="المفضلة" description="المحتوى الذي حفظته" href="/account" assets={favorites} /> : null}
      {live.length || movies.length || series.length ? <>
        {live.length ? <CatalogSection title="مباشر الآن" description="اختر قناة وابدأ المشاهدة" href="/live" assets={live} /> : null}
        {movies.length ? <CatalogSection title="أفلام" description="جاهزة للمشاهدة" href="/movies" assets={movies} /> : null}
        {series.length ? <CatalogSection title="مسلسلات" description="اختر الموسم والحلقة" href="/series" assets={series} /> : null}
      </> : <section className="catalog-section container"><EmptyState title="المكتبة قيد التجهيز" body="نعمل على إضافة المحتوى. عد قريبًا لاكتشاف الجديد." /></section>}
    </>
  );
}
