import { useQuery } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api, type Channel } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader } from "@/components/common";

export function AdminChannels() {
  const state = useQuery({ queryKey: ["admin-state"], queryFn: api.adminState });
  return (
    <div>
      <PageHeader
        title="القنوات"
        subtitle="قنوات البث المباشر وأجهزة الالتقاط"
        actions={<AppLink href="/admin/channels/new" className="btn btn-primary">+ إضافة قناة</AppLink>}
      />
      <QueryBoundary
        query={state}
        isEmpty={(d) => (d.broadcast?.length || 0) === 0}
        empty={
          <EmptyState
            icon="📺"
            title="لا توجد قنوات بعد"
            text="أضف قناة من جهاز التقاط عبر المعالج خطوة بخطوة."
            action={<AppLink href="/admin/channels/new" className="btn btn-primary">بدء المعالج</AppLink>}
          />
        }
      >
        {(d) => (
          <div className="card card-pad">
            <table className="table">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>النوع</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {(d.broadcast as Channel[]).map((ch) => (
                  <tr key={String(ch.id)}>
                    <td>{ch.name}</td>
                    <td className="dim">{ch.kind || "بث"}</td>
                    <td>
                      <span className={`badge badge-dot ${ch.enabled === false ? "badge-off" : "badge-on"}`}>
                        {ch.enabled === false ? "متوقفة" : "مفعّلة"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
