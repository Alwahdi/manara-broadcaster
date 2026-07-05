import { useQuery } from "@tanstack/react-query";
import { api, type MediaItem } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader, MediaTile } from "@/components/common";

export function Favorites() {
  const state = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState });
  return (
    <div>
      <PageHeader title="المفضلة" subtitle="الوسائط التي حفظتها للمشاهدة لاحقًا" />
      <QueryBoundary
        query={state}
        isEmpty={(d) => {
          const favs = (d.favorites as unknown[]) || [];
          return favs.length === 0;
        }}
        empty={
          <EmptyState
            icon="⭐"
            title="لا مفضلة بعد"
            text="أضف وسائط إلى المفضلة من صفحة المشاهدة لتظهر هنا."
          />
        }
      >
        {(d) => {
          const favs = ((d.favorites as never[]) || []) as MediaItem[];
          return (
            <div className="grid grid-auto">
              {favs.map((item) => (
                <MediaTile key={item.id} item={item} />
              ))}
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
