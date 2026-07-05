import { useQuery } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api, type Channel } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader } from "@/components/common";

export function AdminIptv() {
  const state = useQuery({ queryKey: ["admin-state"], queryFn: api.adminState });
  return (
    <div>
      <PageHeader
        title="قنوات IPTV"
        subtitle="القنوات المحلية والسحابية"
        actions={<AppLink href="/admin/iptv/import" className="btn btn-primary">استيراد قائمة</AppLink>}
      />
      <QueryBoundary
        query={state}
        isEmpty={(d) => (d.iptv?.length || 0) + (d.cloudIptv?.length || 0) === 0}
        empty={
          <EmptyState
            icon="🛰️"
            title="لا قنوات IPTV"
            text="استورد قائمة M3U أو أضف قناة يدويًا."
            action={<AppLink href="/admin/iptv/import" className="btn btn-primary">استيراد M3U</AppLink>}
          />
        }
      >
        {(d) => {
          const all: Channel[] = [...(d.iptv || []), ...(d.cloudIptv || [])];
          return (
            <div className="card card-pad">
              <table className="table">
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>المجموعة</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((ch) => (
                    <tr key={String(ch.id)}>
                      <td>{ch.name}</td>
                      <td className="dim">{ch.group || "—"}</td>
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
          );
        }}
      </QueryBoundary>
    </div>
  );
}
