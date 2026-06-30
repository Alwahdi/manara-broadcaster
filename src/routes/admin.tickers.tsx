import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { fetchAllTickers, createTicker, updateTicker, deleteTicker, type Ticker } from "@/lib/tickers";
import { ConfirmAction } from "@/components/ConfirmAction";

export const Route = createFileRoute("/admin/tickers")({
  component: () => <AdminShell title="الشريط الإخباري"><TickersAdmin /></AdminShell>,
  head: () => ({ meta: [{ title: "الشريط — لوحة التحكم" }] }),
});

const empty = { text: "", url: "", sortOrder: 0, isActive: true };

function TickersAdmin() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["admin-tickers"], queryFn: fetchAllTickers });
  const [draft, setDraft] = useState(empty);
  const inv = () => qc.invalidateQueries({ queryKey: ["admin-tickers"] });

  const cMut = useMutation({ mutationFn: () => createTicker(draft), onSuccess: () => { toast.success("أُضيف"); inv(); setDraft(empty); }, onError: (e: Error) => toast.error(e.message) });
  const uMut = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<Ticker, "id">> }) => updateTicker(id, patch), onSuccess: () => { toast.success("تم"); inv(); qc.invalidateQueries({ queryKey: ["public-tickers"] }); }, onError: (e: Error) => toast.error(e.message) });
  const dMut = useMutation({ mutationFn: deleteTicker, onSuccess: () => { toast.success("حُذف"); inv(); }, onError: (e: Error) => toast.error(e.message) });

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-2xl p-4 space-y-2">
        <h2 className="font-bold">عنصر جديد</h2>
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto_auto] gap-2">
          <input className="input-base" placeholder="النص" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          <input className="input-base" placeholder="رابط (اختياري)" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
          <input className="input-base w-24" type="number" placeholder="ترتيب" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} />
          <button className="btn-primary inline-flex items-center gap-1" onClick={() => cMut.mutate()} disabled={!draft.text || cMut.isPending}><Plus className="h-4 w-4" /> إضافة</button>
        </div>
      </div>
      <div className="glass-panel rounded-2xl divide-y divide-white/5">
        {isLoading && <div className="p-4 text-sm text-muted-foreground">جارٍ التحميل…</div>}
        {data.map((t) => <TRow key={t.id} t={t} onSave={(p) => uMut.mutate({ id: t.id, patch: p })} onDelete={() => dMut.mutate(t.id)} />)}
        {!isLoading && data.length === 0 && <div className="p-4 text-sm text-muted-foreground">لا يوجد</div>}
      </div>
    </div>
  );
}

function TRow({ t, onSave, onDelete }: { t: Ticker; onSave: (p: Partial<Omit<Ticker, "id">>) => void; onDelete: () => void }) {
  const [s, setS] = useState(t);
  return (
    <div className="p-3 grid grid-cols-1 md:grid-cols-[2fr_1fr_auto_auto_auto] gap-2 items-center">
      <input className="input-base" value={s.text} onChange={(e) => setS({ ...s, text: e.target.value })} />
      <input className="input-base" value={s.url} onChange={(e) => setS({ ...s, url: e.target.value })} />
      <input type="number" className="input-base w-20" value={s.sortOrder} onChange={(e) => setS({ ...s, sortOrder: Number(e.target.value) })} />
      <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={s.isActive} onChange={(e) => setS({ ...s, isActive: e.target.checked })} /> مفعّل</label>
      <div className="flex gap-1">
        <button className="btn-ghost p-2" onClick={() => onSave({ text: s.text, url: s.url, sortOrder: s.sortOrder, isActive: s.isActive })}><Save className="h-4 w-4" /></button>
        <ConfirmAction className="btn-ghost p-2 text-destructive" title="حذف عنصر الشريط؟" message="سيتم حذف هذا النص من شريط المشاهدين." confirmText="حذف" onConfirm={onDelete}><Trash2 className="h-4 w-4" /></ConfirmAction>
      </div>
    </div>
  );
}
