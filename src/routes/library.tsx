import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Clock3, Film, Heart, Library, Play, Search, Sparkles, Star, Tv } from "lucide-react";
import { fetchCategories } from "@/lib/categories";
import { fetchRecentMedia, fetchMediaByCategory } from "@/lib/media";
import { AuroraBackground } from "@/components/AuroraBackground";
import { PRODUCT, pageTitle } from "@/lib/product";

export const Route = createFileRoute("/library")({
  component: LibraryPage,
  head: () => ({
    meta: [
      { title: pageTitle(PRODUCT.libraryName) },
      { name: "description", content: "تصفح مكتبة ويفا للأفلام والوسائط داخل الشبكة المحلية." },
    ],
  }),
});

function LibraryPage() {
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const { data: cats = [] } = useQuery({ queryKey: ["public-cats"], queryFn: fetchCategories });
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["public-media", activeCat],
    queryFn: () => activeCat ? fetchMediaByCategory(activeCat, 120) : fetchRecentMedia(120),
  });
  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return text ? items.filter((m) => m.title.toLowerCase().includes(text)) : items;
  }, [items, q]);
  const hero = filtered[0];
  const recent = filtered.slice(0, 12);
  const more = filtered.slice(12);

  return (
    <div dir="rtl" className="wiva-shell">
      <AuroraBackground />
      <header className="wiva-topbar">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2 rounded-2xl px-2 py-1 font-extrabold text-primary">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-glow">و</span>
            <span>{PRODUCT.libraryName}</span>
          </Link>
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {["الرئيسية", "الأفلام", "المسلسلات", "القنوات", "المفضلة", "متابعة المشاهدة"].map((item) => (
              <button key={item} className="wiva-chip" type="button">{item}</button>
            ))}
          </nav>
          <div className="relative min-w-0 flex-1 md:max-w-xs">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input-base min-h-11 w-full rounded-2xl pr-9"
              placeholder="ابحث في مكتبة ويفا..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-3 sm:px-6">
          <button onClick={() => setActiveCat(null)} className={`wiva-chip ${!activeCat ? "wiva-chip-active" : ""}`}>الكل</button>
          {cats.map((c) => (
            <button key={c.id} onClick={() => setActiveCat(c.id)} className={`wiva-chip ${activeCat === c.id ? "wiva-chip-active" : ""}`}>{c.name}</button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6">
        {isLoading ? (
          <LibrarySkeleton />
        ) : filtered.length === 0 ? (
          <EmptyLibrary query={q} />
        ) : (
          <>
            <section className="wiva-hero min-h-[420px] p-6 sm:p-8 lg:p-10">
              {hero?.posterUrl || hero?.thumbnailUrl ? (
                <img src={hero.posterUrl || hero.thumbnailUrl || ""} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-l from-background via-background/78 to-background/30" />
              <div className="relative z-10 grid min-h-[340px] items-end gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="max-w-2xl">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs font-extrabold text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    اختيار من مكتبة ويفا
                  </div>
                  <h1 className="text-3xl font-black leading-tight sm:text-5xl">{hero?.title}</h1>
                  <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground">
                    {hero?.year && <span>{hero.year}</span>}
                    {hero?.durationSec ? <span>{formatDuration(hero.durationSec)}</span> : null}
                    <span>مشاهدة داخل الشبكة المحلية</span>
                  </div>
                  {hero?.overview && <p className="mt-4 max-w-xl text-sm leading-8 text-muted-foreground line-clamp-3">{hero.overview}</p>}
                  <div className="mt-6 flex flex-wrap gap-2">
                    <Link to="/watch/$id" params={{ id: hero!.id }} className="btn-primary inline-flex min-h-12 items-center gap-2 rounded-2xl px-5">
                      <Play className="h-4 w-4" fill="currentColor" /> شاهد الآن
                    </Link>
                    <button className="btn-ghost inline-flex min-h-12 items-center gap-2 rounded-2xl px-5" type="button">
                      <Heart className="h-4 w-4" /> أضف للمفضلة
                    </button>
                  </div>
                </div>
                <div className="hidden lg:block">
                  <Poster item={hero!} large />
                </div>
              </div>
            </section>

            <ContentRow title="المضاف حديثًا" icon={Clock3} items={recent} />
            <ContentRow title="اقتراحات لك" icon={Star} items={more.length ? more : recent.slice(0, 8)} />
          </>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-background/85 px-4 py-2 backdrop-blur-2xl md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1 text-center text-[11px] font-bold text-muted-foreground">
          <Link to="/library" className="rounded-xl p-2 text-primary"><Library className="mx-auto mb-1 h-5 w-5" />المكتبة</Link>
          <button className="rounded-xl p-2" type="button"><Tv className="mx-auto mb-1 h-5 w-5" />القنوات</button>
          <button className="rounded-xl p-2" type="button"><Heart className="mx-auto mb-1 h-5 w-5" />المفضلة</button>
          <button className="rounded-xl p-2" type="button"><Search className="mx-auto mb-1 h-5 w-5" />بحث</button>
        </div>
      </nav>
    </div>
  );
}

function ContentRow({ title, icon: Icon, items }: { title: string; icon: typeof Film; items: Array<Awaited<ReturnType<typeof fetchRecentMedia>>[number]> }) {
  if (!items.length) return null;
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-xl font-black">
          <Icon className="h-5 w-5 text-primary" /> {title}
        </h2>
        <span className="text-xs font-bold text-muted-foreground">{items.length} عنصر</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {items.map((m) => <Poster key={m.id} item={m} />)}
      </div>
    </section>
  );
}

function Poster({ item, large = false }: { item: Awaited<ReturnType<typeof fetchRecentMedia>>[number]; large?: boolean }) {
  return (
    <Link to="/watch/$id" params={{ id: item.id }} className="wiva-poster-card group">
      <div className={`wiva-poster-frame ${large ? "aspect-[2/3]" : "aspect-[2/3]"}`}>
        {item.posterUrl || item.thumbnailUrl ? (
          <img src={item.posterUrl || item.thumbnailUrl || ""} alt={item.title} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        ) : (
          <div className="grid h-full place-items-center bg-gradient-to-br from-white/10 to-white/5 text-muted-foreground"><Film className="h-10 w-10" /></div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3">
          <div className="line-clamp-1 text-sm font-extrabold">{item.title}</div>
          <div className="mt-1 flex gap-2 text-[11px] text-white/70">
            {item.year && <span>{item.year}</span>}
            {item.durationSec ? <span>{formatDuration(item.durationSec)}</span> : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

function EmptyLibrary({ query }: { query: string }) {
  return (
    <div className="wiva-empty">
      <div>
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-primary/15 text-primary"><Film className="h-8 w-8" /></div>
        <h2 className="text-2xl font-black">{query ? "لم نعثر على نتائج مطابقة" : "مكتبتك جاهزة للبدء"}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">
          {query ? "جرّب كلمة مختلفة أو ارجع إلى كل العناصر." : "اطلب من المدير إضافة مجلد وسائط أو قائمة بث لتظهر الأفلام والقنوات هنا."}
        </p>
      </div>
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div className="space-y-6">
      <div className="wiva-skeleton h-[420px]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => <div key={i} className="wiva-skeleton aspect-[2/3]" />)}
      </div>
    </div>
  );
}

function formatDuration(seconds: number) {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} دقيقة`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} س ${m} د` : `${h} س`;
}
