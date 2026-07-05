import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader } from "@/components/common";

export function LiveGuide() {
  const state = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState });
  return (
    <div>
      <PageHeader title="دليل القنوات" subtitle="جدول القنوات والبرامج المتاحة" />
      <QueryBoundary
        query={state}
        isEmpty={(d) => {
          const list = ((d.channels as unknown[]) || (d.iptv as unknown[]) || []) as unknown[];
          return list.length === 0;
        }}
        empty={<EmptyState icon="🗓️" title="لا يوجد دليل بعد" text="لا تتوفر معلومات جدولة حاليًا." />}
      >
        {(d) => {
          const channels = ((d.channels as never[]) || (d.iptv as never[]) || []) as {
            id: number | string;
            name: string;
            group?: string;
            enabled?: boolean;
          }[];
          return (
            <div className="card card-pad">
              <table className="table">
                <thead>
                  <tr>
                    <th>القناة</th>
                    <th>المجموعة</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((ch) => (
                    <tr key={String(ch.id)}>
                      <td>{ch.name}</td>
                      <td className="dim">{ch.group || "—"}</td>
                      <td>
                        <span className={`badge badge-dot ${ch.enabled === false ? "badge-off" : "badge-on"}`}>
                          {ch.enabled === false ? "متوقفة" : "مباشر"}
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
