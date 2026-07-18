import { Search } from "lucide-react";
import { MediaCard } from "@/components/MediaCard";
import { EmptyState } from "@/components/Section";
import { listAssets } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = (await searchParams).q?.trim() || "";
  const assets = query ? (await listAssets()).filter((asset) => `${asset.title} ${asset.category}`.toLocaleLowerCase("ar").includes(query.toLocaleLowerCase("ar"))) : [];
  return (
    <div className="container">
      <header className="listing-hero"><h1>البحث</h1><p>ابحث في القنوات والأفلام والمسلسلات المتاحة.</p><form className="search-form"><Search size={20} /><input name="q" defaultValue={query} placeholder="اكتب اسم المحتوى…" autoFocus /><button className="button primary">بحث</button></form></header>
      <section className="listing-grid">{query && assets.length ? <div className="media-grid">{assets.map((asset) => <MediaCard key={asset.id} asset={asset} />)}</div> : <EmptyState title={query ? "لا توجد نتائج" : "ابدأ بكتابة اسم"} body={query ? "جرّب كلمة أخرى أو اسمًا أقصر." : "ستظهر النتائج هنا."} />}</section>
    </div>
  );
}
