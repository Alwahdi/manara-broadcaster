import Link from "next/link";
import { CirclePlay, Radio, Star } from "lucide-react";
import type { CatalogAsset } from "@/lib/types";
import { publicAssetTitle, publicLanguage } from "@/lib/presentation";

function initials(title: string) {
  return title.split(/\s+/).slice(0, 2).map((part) => part[0]).join("");
}

export function MediaCard({ asset, priority = false }: { asset: CatalogAsset; priority?: boolean }) {
  const title = publicAssetTitle(asset); const language = publicLanguage(asset.language);
  const isSeries = asset.kind === "series" && !asset.parentAssetId;
  return (
    <Link href={isSeries ? `/series/${asset.id}` : `/watch/${asset.id}`} className="media-card" aria-label={`${isSeries ? "فتح مسلسل" : "مشاهدة"} ${title}`} data-kind={asset.kind} data-priority={priority || undefined} prefetch={priority ? true : null}>
      <div className="media-art">
        {asset.artworkUrl ? <img className="media-poster" src={asset.artworkUrl} alt="" width={480} height={asset.kind === "live" ? 270 : 720} loading={priority ? "eager" : "lazy"} decoding="async" fetchPriority={priority ? "high" : "auto"} referrerPolicy="no-referrer" /> : null}
        {!asset.artworkUrl ? <span className="media-initials">{initials(title)}</span> : null}
        <span className="quality-pill">{asset.quality}</span>
        {asset.kind === "live" ? <span className="live-pill"><i /> مباشر</span> : null}
        {!asset.isActive ? <span className="locked-pill">قريبًا</span> : null}
        <span className="play-float">{asset.kind === "live" ? <Radio size={22} /> : <CirclePlay size={24} />}</span>
      </div>
      <div className="media-meta">
        <strong>{title}</strong>
        <span>{asset.category || (asset.kind === "live" ? "قنوات" : "مكتبة")}</span>
        <div>
          {asset.rating ? <span className="rating" aria-label={`التقييم ${asset.rating} من 5`}><Star size={14} fill="currentColor" /> {asset.rating}/5</span> : null}
          {asset.year ? <span>{asset.year}</span> : null}
          {language ? <span>{language}</span> : null}
        </div>
      </div>
    </Link>
  );
}
