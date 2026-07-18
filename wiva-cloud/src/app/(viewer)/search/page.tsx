import { MediaCard } from "@/components/MediaCard";
import { EmptyState } from "@/components/Section";
import { SmartSearchForm } from "@/components/SmartSearchForm";
import { searchViewerAssets } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = (await searchParams).q?.trim() || "";
  const assets = query ? await searchViewerAssets(query) : [];
  const groups = [
    { kind: "live", title: "القنوات", items: assets.filter((item) => item.kind === "live") },
    { kind: "movie", title: "الأفلام", items: assets.filter((item) => item.kind === "movie") },
    { kind: "series", title: "المسلسلات", items: assets.filter((item) => item.kind === "series") },
  ].filter((group) => group.items.length);
  return (
    <div className="container">
      <header className="listing-hero"><h1>البحث</h1><p>كل القنوات والأفلام والمسلسلات في مكان واحد.</p><SmartSearchForm query={query} />{query ? <span className="search-result-count">{assets.length.toLocaleString("ar")} نتيجة لعبارة «{query}»</span> : null}</header>
      <section className="listing-grid search-results">{query && groups.length ? groups.map((group) => <section key={group.kind}><div className="section-heading"><div><h2>{group.title}</h2><p>{group.items.length.toLocaleString("ar")} نتيجة</p></div></div><div className="media-grid">{group.items.map((asset) => <MediaCard key={asset.id} asset={asset} />)}</div></section>) : <EmptyState title={query ? "لا توجد نتائج" : "ابحث عن شيء تشاهده"} body={query ? "تأكد من الكتابة أو جرّب اسمًا أقصر." : "اكتب اسم قناة أو فيلم أو مسلسل."} />}</section>
    </div>
  );
}
