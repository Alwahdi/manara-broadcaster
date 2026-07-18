import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { notFound } from "next/navigation";
import { PlayerClient } from "@/components/PlayerClient";
import { getAsset } from "@/lib/db";
import { publicAssetTitle, publicLanguage } from "@/lib/presentation";

export const dynamic = "force-dynamic";

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await getAsset(id);
  if (!asset) notFound();
  const title = publicAssetTitle(asset); const language = publicLanguage(asset.language);
  return (
    <div className="container watch-page">
      <div className="watch-breadcrumb"><Link href={asset.kind === "live" ? "/live" : asset.kind === "movie" ? "/movies" : "/series"}>العودة إلى {asset.kind === "live" ? "القنوات" : asset.kind === "movie" ? "الأفلام" : "المسلسلات"}</Link> / {title}</div>
      <div className="watch-layout">
        <PlayerClient assetId={asset.id} title={title} active={asset.isActive} />
        <aside className="watch-info">
          <div className="watch-tags"><span>{asset.kind === "live" ? "مباشر" : asset.kind === "movie" ? "فيلم" : "مسلسل"}</span><span>{asset.quality}</span>{asset.year ? <span>{asset.year}</span> : null}{asset.rating ? <span>★ {asset.rating}</span> : null}</div>
          <h1>{title}</h1>
          <p>{asset.description || "لا يوجد وصف لهذا المحتوى."}</p>
          <div className="watch-tags">{asset.category ? <span>{publicLanguage(asset.category)}</span> : null}{language ? <span>{language}</span> : null}</div>
          <div className="watch-notice"><CheckCircle2 size={18} /><span>اضغط تشغيل واستمتع بالمشاهدة. نحفظ تقدمك في الأفلام والحلقات على هذا الجهاز.</span></div>
        </aside>
      </div>
    </div>
  );
}
