import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, Download, ArrowRight, Loader2 } from "lucide-react";
import { fetchMediaById } from "@/lib/media";
import { fetchFavoriteIds, toggleFavorite } from "@/lib/favorites";
import { useAuth } from "@/hooks/use-auth";
import { pageTitle } from "@/lib/product";


export const Route = createFileRoute("/watch/$id")({
  component: WatchPage,
  head: ({ params }) => ({ meta: [{ title: pageTitle("مشاهدة") }, { name: "description", content: `مشاهدة عنصر ${params.id}` }] }),
});

function WatchPage() {
  const { id } = useParams({ from: "/watch/$id" });
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: media, isLoading } = useQuery({ queryKey: ["media", id], queryFn: () => fetchMediaById(id) });
  const { data: favIds = [] } = useQuery({ queryKey: ["favs", user?.id], queryFn: () => user ? fetchFavoriteIds(user.id) : Promise.resolve([]), enabled: !!user });
  const isFav = favIds.includes(id);

  const favMut = useMutation({
    mutationFn: () => user ? toggleFavorite(user.id, id, !isFav) : Promise.reject(new Error("سجّل الدخول")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favs", user?.id] }),
  });

  if (isLoading) return <div className="flex min-h-[100dvh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!media) return <div dir="rtl" className="p-8 text-center"><p>العنصر غير موجود</p><Link to="/library" className="text-primary underline">عودة للمكتبة</Link></div>;

  const playable = media.hlsUrl || media.downloadUrl;

  return (
    <div dir="rtl" className="min-h-[100dvh]">
      <header className="border-b border-white/10 bg-background/60 backdrop-blur-xl sticky top-0 z-30">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <Link to="/library" className="text-sm text-muted-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4" /> المكتبة</Link>
          <h1 className="font-bold flex-1 line-clamp-1">{media.title}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-4">
        <div className="rounded-3xl overflow-hidden border border-white/10 bg-black">
          {playable
            ? <video src={playable} poster={media.posterUrl || undefined} controls autoPlay className="w-full aspect-video bg-black" />
            : <div className="aspect-video flex items-center justify-center text-muted-foreground">لا يوجد مصدر تشغيل</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          {user && (
            <button onClick={() => favMut.mutate()} className={`btn-ghost inline-flex items-center gap-1 ${isFav ? "text-rose-400" : ""}`}>
              <Heart className={`h-4 w-4 ${isFav ? "fill-current" : ""}`} /> {isFav ? "في المفضّلة" : "أضف للمفضّلة"}
            </button>
          )}
          {media.downloadUrl && (
            <a href={media.downloadUrl} download className="btn-ghost inline-flex items-center gap-1"><Download className="h-4 w-4" /> تنزيل</a>
          )}
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <h2 className="font-bold mb-1">{media.title} {media.year && <span className="text-muted-foreground font-normal">({media.year})</span>}</h2>
          {media.overview && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{media.overview}</p>}
        </div>
      </main>
    </div>
  );
}
