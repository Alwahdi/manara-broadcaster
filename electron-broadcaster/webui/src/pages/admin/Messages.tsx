import { useQuery } from "@tanstack/react-query";
import { api, type ViewerMessage } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader } from "@/components/common";
import { formatDateTime } from "@/lib/format";

export function AdminMessages() {
  const messages = useQuery({ queryKey: ["admin-messages"], queryFn: api.messages });
  return (
    <div>
      <PageHeader title="الرسائل" subtitle="رسائل المشاهدين الواردة" />
      <QueryBoundary
        query={messages}
        isEmpty={(d) => (d.messages?.length || 0) === 0}
        empty={<EmptyState icon="✉️" title="لا رسائل" text="لا توجد رسائل واردة من المشاهدين." />}
      >
        {(d) => (
          <div className="col">
            {(d.messages as ViewerMessage[]).map((m) => (
              <div key={String(m.id)} className="card card-pad">
                <div className="row-between">
                  <strong>{m.from || "مشاهد"}</strong>
                  <span className="dim">{formatDateTime(m.createdAt)}</span>
                </div>
                <p style={{ marginTop: 8, marginBottom: 0 }}>{m.body}</p>
                {m.status ? <span className="badge" style={{ marginTop: 8 }}>{m.status}</span> : null}
              </div>
            ))}
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
