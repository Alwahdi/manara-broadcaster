import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ViewerMessage } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader } from "@/components/common";
import { formatDateTime } from "@/lib/format";

function statusLabel(status?: string) {
  if (status === "done") return "تمت المتابعة";
  if (status === "read") return "تم الاطلاع";
  return "جديدة";
}

export function AdminMessages() {
  const queryClient = useQueryClient();
  const messages = useQuery({ queryKey: ["admin-messages"], queryFn: api.messages });
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number | string; status: "read" | "done" }) => api.updateMessageStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-messages"] }),
  });
  return (
    <div>
      <PageHeader title="الرسائل" subtitle="رسائل المشاهدين الواردة إلى إدارة الشبكة" />
      <QueryBoundary
        query={messages}
        isEmpty={(d) => (d.messages?.length || 0) === 0}
        empty={<EmptyState icon="رسالة" title="لا توجد رسائل" text="ستظهر هنا الرسائل التي يرسلها المشاهدون." />}
      >
        {(d) => (
          <div className="admin-message-list">
            {(d.messages as ViewerMessage[]).map((message) => (
              <article key={String(message.id)} className={`admin-message-card ${message.status === "new" ? "unread" : ""}`}>
                <div className="admin-message-head">
                  <div>
                    <strong>{message.name || message.from || "مشاهد"}</strong>
                    <span>{[message.phone, message.email].filter(Boolean).join(" · ") || "حساب داخل الشبكة"}</span>
                  </div>
                  <div>
                    <span className="badge">{statusLabel(message.status)}</span>
                    <time>{formatDateTime(message.createdAt)}</time>
                  </div>
                </div>
                <p>{message.message || message.body}</p>
                {message.context ? <small>{message.context}</small> : null}
                <div className="admin-message-actions">
                  {message.status === "new" ? (
                    <button className="btn btn-ghost btn-sm" type="button" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: message.id, status: "read" })}>تحديد كمقروءة</button>
                  ) : null}
                  {message.status !== "done" ? (
                    <button className="btn btn-primary btn-sm" type="button" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: message.id, status: "done" })}>تمت المتابعة</button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
