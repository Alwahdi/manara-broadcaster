import { useQuery } from "@tanstack/react-query";
import { api, type ViewerAccount } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader } from "@/components/common";
import { formatDateTime } from "@/lib/format";

export function AdminViewers() {
  const viewers = useQuery({ queryKey: ["admin-viewers"], queryFn: api.viewers });
  return (
    <div>
      <PageHeader title="المشاهدون" subtitle="حسابات المشاهدين والجلسات النشطة" />
      <QueryBoundary
        query={viewers}
        isEmpty={(d) => (d.viewers?.length || 0) === 0}
        empty={<EmptyState icon="👥" title="لا مشاهدين" text="لا توجد حسابات مشاهدين حتى الآن." />}
      >
        {(d) => (
          <div className="card card-pad">
            <table className="table">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>الحالة</th>
                  <th>آخر ظهور</th>
                </tr>
              </thead>
              <tbody>
                {(d.viewers as ViewerAccount[]).map((v) => (
                  <tr key={String(v.id)}>
                    <td>{v.name || v.username || `#${v.id}`}</td>
                    <td>
                      <span className={`badge badge-dot ${v.online ? "badge-on" : "badge-off"}`}>
                        {v.online ? "متصل" : "غير متصل"}
                      </span>
                    </td>
                    <td className="dim">{formatDateTime(v.lastSeen)}</td>
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
