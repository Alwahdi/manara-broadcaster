import { useQuery } from "@tanstack/react-query";
import { api, type MediaItem } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { ContentSection, MediaTile } from "@/components/common";

export function Favorites() {
  const state = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState });
  return (
    <div className="favorites-page">
      <section className="account-hero">
        <span className="badge">قائمتي</span>
        <h1>المفضلة</h1>
        <p>المحتوى الذي اخترته للعودة إليه بسرعة عند توفره.</p>
      </section>
      <QueryBoundary
        query={state}
        isEmpty={(d) => {
          const favs = (d.favorites as unknown[]) || [];
          return favs.length === 0;
        }}
        empty={
          <EmptyState
            icon="W"
            title="لا توجد مفضلة بعد"
            text="عند اختيار محتوى للمشاهدة لاحقًا سيظهر هنا."
          />
        }
      >
        {(d) => {
          const favs = ((d.favorites as never[]) || []) as MediaItem[];
          return (
            <ContentSection title="المحتوى المحفوظ" subtitle={`${favs.length} عنصر`}>
              <div className="grid grid-auto">
                {favs.map((item) => (
                  <MediaTile key={item.id} item={item} />
                ))}
              </div>
            </ContentSection>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
