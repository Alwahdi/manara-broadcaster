import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api, type Channel } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader } from "@/components/common";

export function AdminIptv() {
  const qc = useQueryClient();
  const state = useQuery({ queryKey: ["admin-state"], queryFn: api.adminState });
  const toggle = useMutation({
    mutationFn: (id: number | string) => api.toggleIptv(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-state"] }),
  });
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
                    <th>الإجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((ch) => (
                    <IptvRow key={String(ch.id)} channel={ch} onToggle={(id) => toggle.mutate(id)} busy={toggle.isPending} />
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

function IptvRow({ channel, onToggle, busy }: { channel: Channel; onToggle: (id: number | string) => void; busy: boolean }) {
  const enabled = channel.enabled !== false && channel.enabled !== 0;
  return (
    <tr>
      <td>{channel.name}</td>
      <td className="dim">{channel.group || channel.category || "—"}</td>
      <td>
        <span className={`badge badge-dot ${enabled ? "badge-on" : "badge-off"}`}>
          {enabled ? "مفعّلة" : "متوقفة"}
        </span>
      </td>
      <td>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => onToggle(channel.id)}
          disabled={busy}
        >
          {enabled ? "إيقاف" : "تفعيل"}
        </button>
      </td>
    </tr>
  );
}
