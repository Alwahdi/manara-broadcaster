import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MediaCard } from "@/components/MediaCard";
import type { CatalogAsset } from "@/lib/types";

export function CatalogSection({ title, description, href, assets }: { title: string; description: string; href: string; assets: CatalogAsset[] }) {
  return (
    <section className="catalog-section container">
      <div className="section-heading">
        <div><h2>{title}</h2><p>{description}</p></div>
        <Link href={href}>عرض الكل <ArrowLeft size={17} /></Link>
      </div>
      {assets.length ? (
        <div className={`media-rail ${assets[0]?.kind === "live" ? "live-rail" : "poster-rail"}`}>{assets.map((asset, index) => <MediaCard key={asset.id} asset={asset} priority={index < 4} />)}</div>
      ) : (
        <EmptyState title="لا يوجد محتوى الآن" body="ستظهر العناصر هنا بعد تفعيلها من لوحة الإدارة." />
      )}
    </section>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><span>✦</span><h3>{title}</h3><p>{body}</p></div>;
}
