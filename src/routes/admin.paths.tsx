import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { fetchAllPaths, createPath, updatePath, deletePath, type LibPath } from "@/lib/paths";
import { fetchAllCategories } from "@/lib/categories";

export const Route = createFileRoute("/admin/paths")({
  component: () => <AdminShell title="مكتبات الوسائط"><PathsAdmin /></AdminShell>,
  head: () => ({ meta: [{ title: "المكتبات — لوحة التحكم" }] }),
});

const empty = { name: "", path: "", categoryId: null as string | null, kind: "video", sortOrder: 0, isActive: true, thumbnail: "" };

function PathsAdmin() {
  const qc = useQueryClient();
  const { data: paths = [], isLoading } = useQuery({ queryKey: ["admin-paths"], queryFn: fetchAllPaths });
  const { data: cats = [] } = useQuery({ queryKey: ["admin-cats"], queryFn: fetchAllCategories });
  const [draft, setDraft] = useState(empty);

  const createMut = useMutation({ mutationFn: () => createPath(draft), onSuccess: () => { toast.success("تمت الإضافة"); qc.invalidateQueries({ queryKey: ["admin-paths"] }); setDraft(empty); }, onError: (e: Error) => toast.error(e.message) });
  const updMut = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<LibPath, "id">> }) => updatePath(id, patch), onSuccess: () => { toast.success("تم الحفظ"); qc.invalidateQueries({ queryKey: ["admin-paths"] }); }, onError: (e: Error) => toast.error(e.message) });
  const delMut = useMutation({ mutationFn: deletePath, onSuccess: () => { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["admin-paths"] }); }, onError: (e: Error) => toast.error(e.message) });

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-2xl p-4 space-y-3">
        <h2 className="font-bold">مكتبة جديدة</h2>
        <p className="text-xs text-muted-foreground">تشير إلى مجلد محلي يفهرسه التطبيق على ويندوز ويرفع عناصره.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <input className="input-base" placeholder="الاسم" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className="input-base" placeholder="المسار (D:\\Movies)" value={draft.path} onChange={(e) => setDraft({ ...draft, path: e.target.value })} />
          <select className="input-base" value={draft.categoryId ?? ""} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value || null })}>
            <option value="">— تصنيف —</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input-base" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
            <option value="video">فيديو</option>
            <option value="audio">صوت</option>
            <option value="image">صورة</option>
          </select>
        </div>
        <button onClick={() => createMut.mutate()} disabled={!draft.name || !draft.path || createMut.isPending} className="btn-primary inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> إضافة
        </button>
      </div>

      <div className="glass-panel rounded-2xl divide-y divide-white/5">
        {isLoading && <div className="p-4 text-sm text-muted-foreground">جارٍ التحميل…</div>}
        {paths.map((p) => (
          <PathRow key={p.id} p={p} cats={cats.map((c) => ({ id: c.id, name: c.name }))} onSave={(patch) => updMut.mutate({ id: p.id, patch })} onDelete={() => delMut.mutate(p.id)} />
        ))}
        {!isLoading && paths.length === 0 && <div className="p-4 text-sm text-muted-foreground">لا توجد مكتبات</div>}
      </div>
    </div>
  );
}

function PathRow({ p, cats, onSave, onDelete }: { p: LibPath; cats: { id: string; name: string }[]; onSave: (patch: Partial<Omit<LibPath, "id">>) => void; onDelete: () => void }) {
  const [s, setS] = useState(p);
  return (
    <div className="p-3 grid grid-cols-1 md:grid-cols-[1fr_2fr_1fr_auto_auto] gap-2 items-center">
      <input className="input-base" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
      <input className="input-base" value={s.path} onChange={(e) => setS({ ...s, path: e.target.value })} />
      <select className="input-base" value={s.categoryId ?? ""} onChange={(e) => setS({ ...s, categoryId: e.target.value || null })}>
        <option value="">—</option>
        {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <input type="checkbox" checked={s.isActive} onChange={(e) => setS({ ...s, isActive: e.target.checked })} /> مفعّل
      </label>
      <div className="flex gap-1">
        <button className="btn-ghost p-2" onClick={() => onSave({ name: s.name, path: s.path, categoryId: s.categoryId, isActive: s.isActive })}><Save className="h-4 w-4" /></button>
        <button className="btn-ghost p-2 text-destructive" onClick={() => confirm("حذف؟") && onDelete()}><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
