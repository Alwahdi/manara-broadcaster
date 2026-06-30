import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { fetchAllCategories, createCategory, updateCategory, deleteCategory, type Category } from "@/lib/categories";
import { ConfirmAction } from "@/components/ConfirmAction";

export const Route = createFileRoute("/admin/categories")({
  component: () => <AdminShell title="التصنيفات"><CategoriesAdmin /></AdminShell>,
  head: () => ({ meta: [{ title: "التصنيفات — لوحة التحكم" }] }),
});

const empty = { name: "", slug: "", description: "", imageUrl: "", icon: "", sortOrder: 0, isActive: true };

function CategoriesAdmin() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["admin-cats"], queryFn: fetchAllCategories });
  const [draft, setDraft] = useState(empty);

  const createMut = useMutation({
    mutationFn: () => createCategory(draft),
    onSuccess: () => { toast.success("تمت الإضافة"); qc.invalidateQueries({ queryKey: ["admin-cats"] }); setDraft(empty); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<Category, "id">> }) => updateCategory(id, patch),
    onSuccess: () => { toast.success("تم الحفظ"); qc.invalidateQueries({ queryKey: ["admin-cats"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["admin-cats"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-2xl p-4 space-y-3">
        <h2 className="font-bold">تصنيف جديد</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <input className="input-base" placeholder="الاسم" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className="input-base" placeholder="المعرّف (slug)" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
          <input className="input-base" placeholder="رابط صورة" value={draft.imageUrl} onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })} />
          <input className="input-base" type="number" placeholder="الترتيب" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} />
        </div>
        <textarea className="input-base w-full" rows={2} placeholder="الوصف" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <button onClick={() => createMut.mutate()} disabled={!draft.name || !draft.slug || createMut.isPending} className="btn-primary inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> إضافة
        </button>
      </div>

      <div className="glass-panel rounded-2xl divide-y divide-white/5">
        {isLoading && <div className="p-4 text-sm text-muted-foreground">جارٍ التحميل…</div>}
        {data.map((c) => (
          <CatRow key={c.id} cat={c} onSave={(patch) => updateMut.mutate({ id: c.id, patch })} onDelete={() => delMut.mutate(c.id)} />
        ))}
        {!isLoading && data.length === 0 && <div className="p-4 text-sm text-muted-foreground">لا توجد تصنيفات</div>}
      </div>
    </div>
  );
}

function CatRow({ cat, onSave, onDelete }: { cat: Category; onSave: (p: Partial<Omit<Category, "id">>) => void; onDelete: () => void }) {
  const [c, setC] = useState(cat);
  return (
    <div className="p-3 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-center">
      <input className="input-base" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
      <input className="input-base" value={c.slug} onChange={(e) => setC({ ...c, slug: e.target.value })} />
      <input className="input-base w-24" type="number" value={c.sortOrder} onChange={(e) => setC({ ...c, sortOrder: Number(e.target.value) })} />
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <input type="checkbox" checked={c.isActive} onChange={(e) => setC({ ...c, isActive: e.target.checked })} /> مفعّل
      </label>
      <div className="flex gap-1">
        <button className="btn-ghost p-2" onClick={() => onSave({ name: c.name, slug: c.slug, sortOrder: c.sortOrder, isActive: c.isActive })}><Save className="h-4 w-4" /></button>
        <ConfirmAction className="btn-ghost p-2 text-destructive" title="حذف التصنيف؟" message="سيتم حذف التصنيف من الواجهة العامة." confirmText="حذف" onConfirm={onDelete}><Trash2 className="h-4 w-4" /></ConfirmAction>
      </div>
    </div>
  );
}
