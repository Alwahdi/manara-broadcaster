import Link from "next/link";
import { CirclePlay, Radio, Star } from "lucide-react";
import type { CatalogAsset } from "@/lib/types";
import { publicAssetTitle, publicLanguage } from "@/lib/presentation";

function initials(title: string) {
  return title.split(/\s+/).slice(0, 2).map((part) => part[0]).join("");
}

export function MediaCard({ asset, priority = false }: { asset: CatalogAsset; priority?: boolean }) {
  const title = publicAssetTitle(asset); const language = publicLanguage(asset.language);
  return (
    <Link href={asset.kind === "series" && !asset.parentAssetId ? `/series/${asset.id}` : `/watch/${asset.id}`} className="media-card" data-kind={asset.kind} data-priority={priority || undefined}>
      <div className="media-art" style={asset.artworkUrl ? { backgroundImage: `url(${JSON.stringify(asset.artworkUrl).slice(1, -1)})` } : undefined}>
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
          {asset.rating ? <span className="rating"><Star size={14} fill="currentColor" /> {asset.rating}</span> : null}
          {asset.year ? <span>{asset.year}</span> : null}
          {language ? <span>{language}</span> : null}
        </div>
      </div>
    </Link>
  );
}
