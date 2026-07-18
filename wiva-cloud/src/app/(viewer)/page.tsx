import { CatalogSection, EmptyState } from "@/components/Section";
import { MatchScheduleSection } from "@/components/MatchScheduleSection";
import { listLatestViewerAssets, listViewerAssets } from "@/lib/db";
import { listContinueWatching, listPublicMatchSchedule, listViewerFavorites } from "@/lib/db";
import { currentViewerAccount } from "@/lib/auth";

export const revalidate = 20;

export default async function HomePage() {
  const viewerPromise = currentViewerAccount();
  const [live, latestMovies, latestSeries, continueWatching, favorites, matchSchedule] = await Promise.all([
    listViewerAssets("live", 10), listLatestViewerAssets("movie", 10), listLatestViewerAssets("series", 10),
    viewerPromise.then((account) => account ? listContinueWatching(account.id) : []),
    viewerPromise.then((account) => account ? listViewerFavorites(account.id) : []),
    listPublicMatchSchedule(),
  ]);
  return (
    <>
      {continueWatching.length ? <CatalogSection title="تابع المشاهدة" description="أكمل من حيث توقفت" href="/account" assets={continueWatching} /> : null}
      {latestMovies.length || latestSeries.length || live.length ? <div className="home-feed">
        {latestMovies.length ? <CatalogSection title="أحدث الأفلام" description="آخر ما أضيف إلى WIVA" href="/movies" assets={latestMovies} /> : null}
        {latestSeries.length ? <CatalogSection title="أحدث المسلسلات" description="المسلسلات والحلقات المضافة حديثًا" href="/series" assets={latestSeries} /> : null}
        {live.length ? <CatalogSection title="مباشر الآن" description="قنوات جاهزة للمشاهدة" href="/live" assets={live} /> : null}
        <MatchScheduleSection matches={matchSchedule} />
        {favorites.length ? <CatalogSection title="المفضلة" description="المحتوى الذي حفظته" href="/account" assets={favorites} /> : null}
      </div> : <section className="catalog-section container"><EmptyState title="المكتبة قيد التجهيز" body="نعمل على إضافة المحتوى. عد قريبًا لاكتشاف الجديد." /></section>}
    </>
  );
}
