import { MediaCard } from "@/components/MediaCard";
import { EmptyState } from "@/components/Section";
import { listAssets } from "@/lib/db";
import type { AssetKind } from "@/lib/types";

export async function CatalogPage({ kind, title, description }: { kind: AssetKind; title: string; description: string }) {
  const assets = await listAssets(kind);
  const categories = [...new Set(assets.map((asset) => asset.category).filter(Boolean))];
  return (
    <div className="container">
      <header className="listing-hero"><span className="eyebrow"><i /> {assets.length} عنصر</span><h1>{title}</h1><p>{description}</p><div className="filter-row"><span className="filter-chip">الكل</span>{categories.map((category) => <span key={category} className="filter-chip">{category}</span>)}</div></header>
      <section className="listing-grid">
        {assets.length ? <div className="media-grid">{assets.map((asset) => <MediaCard key={asset.id} asset={asset} />)}</div> : <EmptyState title="لا يوجد محتوى مفعّل" body="أضف مصدرًا مرخّصًا وفعّل العناصر من لوحة الإدارة." />}
      </section>
    </div>
  );
}
