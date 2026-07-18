import { Layers3 } from "lucide-react";
import { notFound } from "next/navigation";
import { MediaCard } from "@/components/MediaCard";
import { getAsset, listSeriesEpisodes } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SeriesDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const series = await getAsset(id);
  if (!series || series.kind !== "series" || series.parentAssetId) notFound();
  const episodes = await listSeriesEpisodes(id);
  const seasons = [...new Set(episodes.map((episode) => episode.seasonNumber).filter((value): value is number => value != null))];
  return <div className="container series-detail-page">
    <header className="listing-hero"><span className="eyebrow"><i /> مسلسل · {episodes.length.toLocaleString("ar")} حلقة</span><h1>{series.title}</h1><p>{series.description || "اختر الموسم والحلقة التي تريد مشاهدتها."}</p></header>
    {seasons.length ? seasons.map((season) => <section className="catalog-section" key={season}><div className="section-heading"><div><h2>الموسم {season.toLocaleString("ar")}</h2><p>{episodes.filter((episode) => episode.seasonNumber === season).length.toLocaleString("ar")} حلقة</p></div></div><div className="media-grid">{episodes.filter((episode) => episode.seasonNumber === season).map((episode) => <MediaCard key={episode.id} asset={episode} />)}</div></section>) : <div className="empty-state"><span><Layers3 /></span><h3>لا توجد حلقات الآن</h3><p>ستظهر الحلقات هنا فور توفرها للمشاهدة.</p></div>}
  </div>;
}
