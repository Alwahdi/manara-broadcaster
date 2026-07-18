import { notFound } from "next/navigation";
import { SeriesEpisodesBrowser } from "@/components/SeriesEpisodesBrowser";
import { getAsset, listSeriesEpisodes } from "@/lib/db";
import { publicAssetTitle } from "@/lib/presentation";

export const dynamic = "force-dynamic";

export default async function SeriesDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [series, episodes] = await Promise.all([getAsset(id), listSeriesEpisodes(id)]);
  if (!series || series.kind !== "series" || series.parentAssetId) notFound();
  return <div className="container series-detail-page">
    <header className="listing-hero series-detail-hero"><span className="eyebrow"><i /> مسلسل · {episodes.length.toLocaleString("ar")} حلقة</span><h1 dir="auto">{publicAssetTitle(series)}</h1><p dir="auto">{series.description || "اختر الموسم والحلقة التي تريد مشاهدتها."}</p></header>
    <SeriesEpisodesBrowser episodes={episodes} />
  </div>;
}
