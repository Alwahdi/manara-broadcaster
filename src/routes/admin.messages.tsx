import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Trash2, MailOpen } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { fetchMessages, markMessageRead, markAllMessagesRead, deleteMessage } from "@/lib/messages";

export const Route = createFileRoute("/admin/messages")({
  component: () => <AdminShell title="الرسائل الواردة"><MessagesAdmin /></AdminShell>,
  head: () => ({ meta: [{ title: "الرسائل — لوحة التحكم" }] }),
});

function MessagesAdmin() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["admin-messages"], queryFn: fetchMessages });
  const inv = () => qc.invalidateQueries({ queryKey: ["admin-messages"] });

  const readMut = useMutation({ mutationFn: ({ id, r }: { id: string; r: boolean }) => markMessageRead(id, r), onSuccess: inv });
  const allMut = useMutation({ mutationFn: markAllMessagesRead, onSuccess: () => { toast.success("تم"); inv(); } });
  const delMut = useMutation({ mutationFn: deleteMessage, onSuccess: () => { toast.success("حُذفت"); inv(); } });

  const unread = data.filter((m) => !m.isRead).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{data.length} رسالة • {unread} غير مقروءة</p>
        {unread > 0 && <button className="btn-ghost inline-flex items-center gap-1" onClick={() => allMut.mutate()}><MailOpen className="h-4 w-4" /> تحديد الكل كمقروء</button>}
      </div>
      <div className="space-y-2">
        {isLoading && <div className="text-sm text-muted-foreground">جارٍ التحميل…</div>}
        {data.map((m) => (
          <div key={m.id} className={`glass-panel rounded-2xl p-4 ${!m.isRead ? "border-primary/40" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold flex items-center gap-2">
                  {m.name}
                  {!m.isRead && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">جديد</span>}
                </div>
                <div className="text-xs text-muted-foreground">{m.email} {m.phone && `• ${m.phone}`} • {new Date(m.createdAt).toLocaleString("ar")}</div>
                {m.subject && <div className="text-sm font-medium mt-1">{m.subject}</div>}
                <p className="text-sm mt-2 whitespace-pre-wrap">{m.body}</p>
              </div>
              <div className="flex flex-col gap-1">
                <button className="btn-ghost p-2" title={m.isRead ? "إعادة كغير مقروء" : "تحديد كمقروء"} onClick={() => readMut.mutate({ id: m.id, r: !m.isRead })}><Check className="h-4 w-4" /></button>
                <button className="btn-ghost p-2 text-destructive" onClick={() => confirm("حذف؟") && delMut.mutate(m.id)}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        ))}
        {!isLoading && data.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">لا توجد رسائل</div>}
      </div>
    </div>
  );
}
