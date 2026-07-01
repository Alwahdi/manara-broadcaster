import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Download, Film, Heart, Loader2, Play } from "lucide-react";
import { fetchMediaById } from "@/lib/media";
import { fetchFavoriteIds, toggleFavorite } from "@/lib/favorites";
import { useAuth } from "@/hooks/use-auth";
import { PRODUCT, pageTitle } from "@/lib/product";

export const Route = createFileRoute("/watch/$id")({
  component: WatchPage,
  head: ({ params }) => ({ meta: [{ title: pageTitle("المشاهدة") }, { name: "description", content: `مشاهدة عنصر ${params.id} في ${PRODUCT.viewerName}` }] }),
});

function WatchPage() {
  const { id } = useParams({ from: "/watch/$id" });
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: media, isLoading } = useQuery({ queryKey: ["media", id], queryFn: () => fetchMediaById(id) });
  const { data: favIds = [] } = useQuery({ queryKey: ["favs", user?.id], queryFn: () => user ? fetchFavoriteIds(user.id) : Promise.resolve([]), enabled: !!user });
  const isFav = favIds.includes(id);

  const favMut = useMutation({
    mutationFn: () => user ? toggleFavorite(user.id, id, !isFav) : Promise.reject(new Error("سجّل الدخول لحفظ المفضلة")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favs", user?.id] }),
  });

  if (isLoading) {
    return (
      <div dir="rtl" className="wiva-shell grid place-items-center p-6">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" />
          <p className="font-bold text-muted-foreground">جاري تجهيز الفيديو...</p>
        </div>
      </div>
    );
  }
  if (!media) {
    return (
      <div dir="rtl" className="wiva-shell grid place-items-center p-6">
        <div className="wiva-empty max-w-lg">
          <div>
            <Film className="mx-auto mb-4 h-12 w-12 text-primary" />
            <h1 className="text-2xl font-black">هذا المحتوى غير متاح</h1>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">قد يكون المحتوى أزيل من المكتبة أو لم يعد متاحًا لهذا الجهاز.</p>
            <Link to="/library" className="btn-primary mt-5 inline-flex items-center gap-2 rounded-2xl px-5 py-3"><ArrowRight className="h-4 w-4" /> العودة إلى المكتبة</Link>
          </div>
        </div>
      </div>
    );
  }

  const playable = media.hlsUrl || media.downloadUrl;

  return (
    <div dir="rtl" className="wiva-shell">
      {media.posterUrl || media.thumbnailUrl ? (
        <img src={media.posterUrl || media.thumbnailUrl || ""} alt="" className="fixed inset-0 -z-10 h-full w-full object-cover opacity-20 blur-2xl" />
      ) : null}
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-background/70 via-background to-background" />
      <header className="wiva-topbar">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/library" className="btn-ghost inline-flex min-h-10 items-center gap-2 rounded-2xl px-3">
            <ArrowRight className="h-4 w-4" /> المكتبة
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-extrabold text-primary">{PRODUCT.viewerName}</p>
            <h1 className="truncate text-base font-black">{media.title}</h1>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-4">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-elegant">
            {playable ? (
              <video src={playable} poster={media.posterUrl || undefined} controls autoPlay playsInline className="aspect-video w-full bg-black" />
            ) : (
              <div className="grid aspect-video place-items-center bg-black p-8 text-center">
                <div>
                  <Film className="mx-auto mb-3 h-10 w-10 text-primary" />
                  <h2 className="text-xl font-black">لا يوجد مصدر تشغيل</h2>
                  <p className="mt-2 max-w-md text-sm leading-7 text-muted-foreground">اطلب من المدير فحص ملف الوسائط أو إعادة فهرسة المكتبة.</p>
                </div>
              </div>
            )}
          </div>
          <div className="glass-panel rounded-3xl p-5">
            <h2 className="text-2xl font-black">{media.title}</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
              {media.year && <span>{media.year}</span>}
              {media.durationSeconds ? <span>{formatDuration(media.durationSeconds)}</span> : null}
              <span>مكتبة ويفا</span>
            </div>
            {media.overview && <p className="mt-4 whitespace-pre-wrap text-sm leading-8 text-muted-foreground">{media.overview}</p>}
          </div>
        </section>

        <aside className="space-y-3">
          {media.posterUrl || media.thumbnailUrl ? (
            <img src={media.posterUrl || media.thumbnailUrl || ""} alt={media.title} className="w-full rounded-[2rem] border border-white/10 object-cover shadow-elegant" />
          ) : null}
          <div className="glass-panel rounded-3xl p-4">
            <h3 className="mb-3 font-black">إجراءات سريعة</h3>
            <div className="grid gap-2">
              {playable && <a href="#top" className="btn-primary inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3"><Play className="h-4 w-4" fill="currentColor" /> متابعة المشاهدة</a>}
              {user && (
                <button onClick={() => favMut.mutate()} className={`btn-ghost inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 ${isFav ? "text-rose-300" : ""}`}>
                  <Heart className={`h-4 w-4 ${isFav ? "fill-current" : ""}`} /> {isFav ? "موجود في المفضلة" : "أضف إلى المفضلة"}
                </button>
              )}
              {media.downloadUrl && (
                <a href={media.downloadUrl} download className="btn-ghost inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3"><Download className="h-4 w-4" /> تحميل الملف</a>
              )}
            </div>
          </div>
        </aside>
      </main>
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
