import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { MediaCard } from "@/components/MediaCard";
import { EmptyState } from "@/components/Section";
import { listViewerCatalog } from "@/lib/db";
import type { AssetKind } from "@/lib/types";

export async function CatalogPage({ kind, title, description, searchParams = {} }: { kind: AssetKind; title: string; description: string; searchParams?: { page?: string; category?: string; q?: string } }) {
  const category = searchParams.category?.trim() || ""; const search = searchParams.q?.trim() || "";
  const requestedPage = Math.max(1, Number(searchParams.page || 1) || 1);
  const { items: assets, categories, total, page, pageSize } = await listViewerCatalog(kind, { page: requestedPage, category, search });
  const pages = Math.max(1, Math.ceil(total / pageSize)); const base = kind === "live" ? "/live" : kind === "movie" ? "/movies" : "/series";
  const href = (nextPage: number, nextCategory = category) => {
    const params = new URLSearchParams(); if (nextPage > 1) params.set("page", String(nextPage)); if (nextCategory) params.set("category", nextCategory); if (search) params.set("q", search);
    return `${base}${params.size ? `?${params}` : ""}`;
  };
  return (
    <div className="container">
      <header className="listing-hero">
        <span className="eyebrow"><i /> {total.toLocaleString("ar")} عنصر</span><h1>{title}</h1><p>{description}</p>
        <form className="catalog-search" action={base}><Search size={19} /><input name="q" defaultValue={search} placeholder={`ابحث في ${title}…`} /><button className="button primary">بحث</button></form>
        <div className="filter-row" aria-label="التصنيفات"><Link href={href(1, "")} className={`filter-chip ${!category ? "active" : ""}`}>الكل</Link>{categories.map((item) => <Link key={item} href={href(1, item)} className={`filter-chip ${category === item ? "active" : ""}`}>{item}</Link>)}</div>
      </header>
      <section className="listing-grid">
        {assets.length ? <><div className="media-grid">{assets.map((asset, index) => <MediaCard key={asset.id} asset={asset} priority={index < 5} />)}</div>{pages > 1 ? <nav className="viewer-pagination" aria-label="صفحات المحتوى"><Link href={href(Math.max(1, page - 1))} aria-disabled={page <= 1}><ChevronRight /> السابق</Link><span>صفحة {page.toLocaleString("ar")} من {pages.toLocaleString("ar")}</span><Link href={href(Math.min(pages, page + 1))} aria-disabled={page >= pages}>التالي <ChevronLeft /></Link></nav> : null}</> : <EmptyState title="لا توجد نتائج" body={search || category ? "جرّب كلمة بحث أو تصنيفًا آخر." : "سيظهر المحتوى الجديد هنا فور توفره."} />}
      </section>
    </div>
  );
}
