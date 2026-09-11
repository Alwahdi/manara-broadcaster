import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api, type MediaItem } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { ContentSection, FavoriteButton, MediaTile } from "@/components/common";

const collections = [
  { id: "favorites", label: "المفضلة", empty: "أضف المحتوى إلى المفضلة باستخدام زر القلب." },
  { id: "watchLater", label: "المشاهدة لاحقًا", empty: "اختر «إضافة إلى المشاهدة لاحقًا» من صفحة المحتوى للعودة إليه هنا." },
  { id: "history", label: "سجل المشاهدة", empty: "بعد تشغيل المحتوى، سيظهر سجل المشاهدة المتاح هنا." },
] as const;

export function Favorites() {
  const state = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState });
  const [selected, setSelected] = useState<(typeof collections)[number]["id"]>("favorites");
  const collection = collections.find((item) => item.id === selected)!;
  return (
    <div className="favorites-page">
      <section className="account-hero">
        <span className="badge">قائمتي</span>
        <h1>قائمتي</h1>
        <p>المحتوى الذي اخترته للعودة إليه بسرعة عند توفره.</p>
        <button type="button" className="btn btn-ghost btn-sm" disabled={state.isFetching} onClick={() => void state.refetch()}>
          {state.isFetching ? "جارٍ التحديث…" : "تحديث القائمة"}
        </button>
      </section>
      <QueryBoundary
        query={state}
      >
        {(d) => {
          const history = (d.history || []).map((entry) => entry.media).filter((item): item is MediaItem => !!item);
          const lists = { favorites: d.favorites || [], watchLater: d.watchLater || [], history };
          const items = lists[selected];
          return (
            <>
            <div className="row collection-filters" role="group" aria-label="القوائم المحفوظة">
              {collections.map((entry) => <button type="button" key={entry.id} className={`btn ${selected === entry.id ? "btn-primary" : "btn-ghost"}`} aria-pressed={selected === entry.id} onClick={() => setSelected(entry.id)}>
                {entry.label} ({lists[entry.id].length.toLocaleString("ar")})
              </button>)}
            </div>
            {!items.length ? <EmptyState title={`لا توجد عناصر في ${collection.label}`} text={collection.empty} action={<AppLink href="/library" className="btn btn-primary">تصفح المكتبة</AppLink>} /> :
            <ContentSection title={collection.label} subtitle={`${items.length.toLocaleString("ar")} عنصر متاح`}>
              <div className="grid grid-auto">
                {items.map((item) => (
                  <div key={item.id}>
                    <MediaTile item={item} />
                    {selected === "watchLater" ? <FavoriteButton mediaId={item.id} list="watchLater" compact={false} /> : null}
                  </div>
                ))}
              </div>
            </ContentSection>}
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
