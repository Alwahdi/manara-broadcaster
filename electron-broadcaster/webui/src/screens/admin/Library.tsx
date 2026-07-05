import { useQuery } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
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
            <AppLink href="/admin/library/sources" className="btn btn-ghost">المصادر</AppLink>
            <AppLink href="/admin/library/browser" className="btn btn-primary">متصفح الملفات</AppLink>
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
            action={<AppLink href="/admin/library/sources" className="btn btn-primary">إضافة مصدر</AppLink>}
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
