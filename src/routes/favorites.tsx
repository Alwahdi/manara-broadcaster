import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Heart, Film, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { fetchFavoriteIds } from "@/lib/favorites";
import { fetchMediaById } from "@/lib/media";

export const Route = createFileRoute("/favorites")({
  component: FavoritesPage,
  head: () => ({ meta: [{ title: "المفضّلة — تيرا نت" }, { name: "description", content: "قائمة المفضّلة الخاصة بك." }] }),
});

function FavoritesPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => { if (!loading && !user) nav({ to: "/login/admin" }); }, [loading, user, nav]);

  const { data: ids = [] } = useQuery({ queryKey: ["favs", user?.id], queryFn: () => user ? fetchFavoriteIds(user.id) : Promise.resolve([]), enabled: !!user });
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["fav-media", ids],
    queryFn: async () => (await Promise.all(ids.map(fetchMediaById))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof fetchMediaById>>>[],
    enabled: ids.length > 0,
  });

  if (loading || !user) return <div className="flex min-h-[100dvh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div dir="rtl" className="min-h-[100dvh]">
      <header className="border-b border-white/10 bg-background/60 backdrop-blur-xl sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
          <Link to="/" className="text-sm text-muted-foreground">← الرئيسية</Link>
          <h1 className="font-bold flex-1 inline-flex items-center gap-2"><Heart className="h-5 w-5 text-rose-400 fill-current" /> المفضّلة</h1>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        {ids.length === 0 && <div className="text-center text-muted-foreground py-16"><Heart className="h-12 w-12 mx-auto mb-3 opacity-50" />لا توجد عناصر في المفضّلة بعد</div>}
        {isLoading && <div className="text-center text-muted-foreground py-12">جارٍ التحميل…</div>}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {items.map((m) => (
            <Link key={m.id} to="/watch/$id" params={{ id: m.id }} className="group block">
              <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 border border-white/10 group-hover:border-primary/50">
                {m.posterUrl || m.thumbnailUrl
                  ? <img src={m.posterUrl || m.thumbnailUrl} alt={m.title} loading="lazy" className="w-full h-full object-cover" />
                  : <div className="flex h-full items-center justify-center text-muted-foreground"><Film className="h-8 w-8" /></div>}
              </div>
              <div className="mt-2 text-sm font-medium line-clamp-1">{m.title}</div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
