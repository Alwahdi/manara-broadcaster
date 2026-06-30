import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Film } from "lucide-react";
import { fetchCategories } from "@/lib/categories";
import { fetchRecentMedia, fetchMediaByCategory } from "@/lib/media";
import { AuroraBackground } from "@/components/AuroraBackground";
import { pageTitle } from "@/lib/product";

export const Route = createFileRoute("/library")({
  component: LibraryPage,
  head: () => ({
    meta: [
      { title: pageTitle("المكتبة") },
      { name: "description", content: "تصفح مكتبة الأفلام والوسائط حسب التصنيف." },
    ],
  }),
});

function LibraryPage() {
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const { data: cats = [] } = useQuery({ queryKey: ["public-cats"], queryFn: fetchCategories });
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["public-media", activeCat],
    queryFn: () => activeCat ? fetchMediaByCategory(activeCat, 100) : fetchRecentMedia(100),
  });
  const filtered = q ? items.filter((m) => m.title.toLowerCase().includes(q.toLowerCase())) : items;

  return (
    <div dir="rtl" className="min-h-[100dvh]">
      <AuroraBackground />
      <header className="sticky top-0 z-30 border-b border-white/10 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← الرئيسية</Link>
          <h1 className="text-lg font-bold flex-1">المكتبة</h1>
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className="input-base pr-8 w-40 sm:w-64" placeholder="ابحث…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 pb-3 flex gap-2 overflow-x-auto">
          <button onClick={() => setActiveCat(null)} className={`px-3 py-1.5 rounded-xl text-sm whitespace-nowrap ${!activeCat ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground hover:text-foreground"}`}>الكل</button>
          {cats.map((c) => (
            <button key={c.id} onClick={() => setActiveCat(c.id)} className={`px-3 py-1.5 rounded-xl text-sm whitespace-nowrap ${activeCat === c.id ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground hover:text-foreground"}`}>{c.name}</button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        {isLoading && <div className="text-center text-muted-foreground py-12">جارٍ التحميل…</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground"><Film className="h-12 w-12 mx-auto mb-3 opacity-50" />لا توجد عناصر</div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((m) => (
            <Link key={m.id} to="/watch/$id" params={{ id: m.id }} className="group block">
              <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 border border-white/10 group-hover:border-primary/50 transition relative">
                {m.posterUrl || m.thumbnailUrl ? (
                  <img src={m.posterUrl || m.thumbnailUrl} alt={m.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground"><Film className="h-8 w-8" /></div>
                )}
              </div>
              <div className="mt-2 text-sm font-medium line-clamp-1">{m.title}</div>
              {m.year && <div className="text-xs text-muted-foreground">{m.year}</div>}
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
