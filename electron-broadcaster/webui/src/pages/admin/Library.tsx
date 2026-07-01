import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader, MediaTile } from "@/components/common";

export function AdminLibrary() {
  const state = useQuery({ queryKey: ["admin-state"], queryFn: api.adminState });
  return (
    <div>
      <PageHeader
        title="المكتبة"
        subtitle="إدارة الوسائط والمصادر"
        actions={
          <>
            <Link to="/admin/library/sources" className="btn btn-ghost">المصادر</Link>
            <Link to="/admin/library/browser" className="btn btn-primary">متصفح الملفات</Link>
          </>
        }
      />
      <QueryBoundary
        query={state}
        isEmpty={(d) => (d.media?.length || 0) === 0}
        empty={
          <EmptyState
            icon="🎬"
            title="لا وسائط بعد"
            text="أضف مصدر تخزين وابدأ الفحص لعرض الوسائط."
            action={<Link to="/admin/library/sources" className="btn btn-primary">إضافة مصدر</Link>}
          />
        }
      >
        {(d) => (
          <div className="grid grid-auto">
            {(d.media || []).map((item) => (
              <MediaTile key={item.id} item={item} />
            ))}
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
