import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader, MediaTile } from "@/components/common";

export function Library() {
  const library = useQuery({ queryKey: ["library"], queryFn: () => api.library() });
  return (
    <div>
      <PageHeader
        title="المكتبة"
        subtitle="جميع الأفلام والمقاطع والوسائط المتاحة"
        actions={<Link to="/library/folders" className="btn btn-ghost">عرض المجلدات</Link>}
      />
      <QueryBoundary
        query={library}
        isEmpty={(d) => !d.items || d.items.length === 0}
        empty={<EmptyState icon="🎬" title="المكتبة فارغة" text="لم تتم إضافة أي وسائط بعد." />}
      >
        {(data) => (
          <div className="grid grid-auto">
            {data.items.map((item) => (
              <MediaTile key={item.id} item={item} />
            ))}
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
