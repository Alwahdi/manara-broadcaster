import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, FolderPlus, HardDrive, LibraryBig, RefreshCw, Save, Trash2, XCircle } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { fetchAllPaths, createPath, updatePath, deletePath, type LibPath } from "@/lib/paths";
import { fetchAllCategories } from "@/lib/categories";
import { fetchAllMedia } from "@/lib/media";
import { ConfirmAction } from "@/components/ConfirmAction";

export const Route = createFileRoute("/admin/paths")({
  component: () => <AdminShell title="مكتبات الوسائط"><PathsAdmin /></AdminShell>,
  head: () => ({ meta: [{ title: "المكتبات — لوحة التحكم" }] }),
});

const empty = { name: "", path: "", categoryId: null as string | null, kind: "video", sortOrder: 0, isActive: true, thumbnail: "" };

function PathsAdmin() {
  const qc = useQueryClient();
  const { data: paths = [], isLoading } = useQuery({ queryKey: ["admin-paths"], queryFn: fetchAllPaths });
  const { data: cats = [] } = useQuery({ queryKey: ["admin-cats"], queryFn: fetchAllCategories });
  const { data: media = [] } = useQuery({ queryKey: ["admin-media"], queryFn: fetchAllMedia });
  const [draft, setDraft] = useState(empty);

  const counts = useMemo(() => {
    const byPath = new Map<string, number>();
    for (const item of media) if (item.pathId) byPath.set(item.pathId, (byPath.get(item.pathId) ?? 0) + 1);
    return byPath;
  }, [media]);
  const active = paths.filter((p) => p.isActive).length;
  const totalItems = paths.reduce((sum, path) => sum + (counts.get(path.id) ?? 0), 0);

  const createMut = useMutation({
    mutationFn: () => createPath(draft),
    onSuccess: () => {
      toast.success("تمت إضافة مصدر المكتبة");
      qc.invalidateQueries({ queryKey: ["admin-paths"] });
      setDraft(empty);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const updMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<LibPath, "id">> }) => updatePath(id, patch),
    onSuccess: () => {
      toast.success("تم حفظ المصدر");
      qc.invalidateQueries({ queryKey: ["admin-paths"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: deletePath,
    onSuccess: () => {
      toast.success("تم حذف المصدر من الإدارة");
      qc.invalidateQueries({ queryKey: ["admin-paths"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-3">
        <StatCard icon={HardDrive} label="مصادر المكتبة" value={paths.length} hint={`${active} مفعّل`} />
        <StatCard icon={LibraryBig} label="عناصر مفهرسة" value={totalItems} hint="مرتبطة بالمصادر الحالية" />
        <StatCard icon={RefreshCw} label="جاهزية العرض" value={`${Math.round((active / Math.max(1, paths.length)) * 100)}%`} hint="المصادر المفعّلة تظهر للمشاهد" />
      </section>

      <section className="glass-panel overflow-hidden rounded-3xl">
        <div className="border-b border-white/10 p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/15 text-primary">
              <FolderPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black">إضافة مصدر استراحة</h2>
              <p className="mt-1 text-sm leading-7 text-muted-foreground">
                أضف مجلد الأفلام أو المسلسلات كما هو على الجهاز. سيظهر للمستخدم كمصدر/مجلد منظم داخل الاستراحة.
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2 xl:grid-cols-5">
          <Field label="اسم المصدر">
            <input className="input-base min-h-11 w-full" placeholder="أفلام الهارد D" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="المسار">
            <input className="input-base min-h-11 w-full" dir="ltr" placeholder="D:\\Movies" value={draft.path} onChange={(e) => setDraft({ ...draft, path: e.target.value })} />
          </Field>
          <Field label="التصنيف">
            <select className="input-base min-h-11 w-full" value={draft.categoryId ?? ""} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value || null })}>
              <option value="">بدون تصنيف</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="النوع">
            <select className="input-base min-h-11 w-full" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
              <option value="video">فيديو</option>
              <option value="audio">صوت</option>
              <option value="image">صور</option>
            </select>
          </Field>
          <Field label="صورة المصدر">
            <input className="input-base min-h-11 w-full" placeholder="رابط صورة اختياري" value={draft.thumbnail} onChange={(e) => setDraft({ ...draft, thumbnail: e.target.value })} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-5">
          <p className="text-xs leading-6 text-muted-foreground">يفضل اختيار مجلد رئيسي واضح، ثم سيعرض WIVA المجلدات الفرعية داخله للمشاهدين.</p>
          <button onClick={() => createMut.mutate()} disabled={!draft.name || !draft.path || createMut.isPending} className="btn-primary inline-flex min-h-11 items-center gap-2 rounded-2xl px-5">
            <FolderPlus className="h-4 w-4" /> إضافة المصدر
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black">المصادر الحالية</h2>
          <span className="text-xs font-bold text-muted-foreground">{paths.length} مصدر</span>
        </div>
        {isLoading && <div className="wiva-skeleton h-28" />}
        {!isLoading && paths.length === 0 && (
          <div className="wiva-empty min-h-[220px]">
            <div>
              <HardDrive className="mx-auto mb-3 h-10 w-10 text-primary" />
              <h3 className="text-xl font-black">لا توجد مصادر مكتبة بعد</h3>
              <p className="mt-2 text-sm text-muted-foreground">أضف أول مجلد حتى تظهر الاستراحة للمستخدمين بشكل مرتب.</p>
            </div>
          </div>
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          {paths.map((p) => (
            <PathCard
              key={p.id}
              p={p}
              cats={cats.map((c) => ({ id: c.id, name: c.name }))}
              count={counts.get(p.id) ?? 0}
              onSave={(patch) => updMut.mutate({ id: p.id, patch })}
              onDelete={() => delMut.mutate(p.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint }: { icon: typeof HardDrive; label: string; value: string | number; hint: string }) {
  return (
    <div className="glass-panel rounded-3xl p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/15 text-primary"><Icon className="h-5 w-5" /></div>
        <div>
          <div className="text-2xl font-black">{value}</div>
          <div className="text-sm font-bold text-muted-foreground">{label}</div>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-extrabold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function PathCard({ p, cats, count, onSave, onDelete }: { p: LibPath; cats: { id: string; name: string }[]; count: number; onSave: (patch: Partial<Omit<LibPath, "id">>) => void; onDelete: () => void }) {
  const [s, setS] = useState(p);
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045] shadow-elegant">
      <div className="relative min-h-36 p-4">
        {s.thumbnail ? <img src={s.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" /> : null}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/35" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
              <HardDrive className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-black">{p.name || "مصدر مكتبة"}</h3>
              <p className="mt-1 truncate text-xs text-muted-foreground" dir="ltr">{p.path}</p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-black ${s.isActive ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-red-400/25 bg-red-400/10 text-red-200"}`}>
            {s.isActive ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            {s.isActive ? "مفعّل" : "متوقف"}
          </span>
        </div>
        <div className="relative mt-5 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3"><b className="block text-lg">{count}</b><span className="text-muted-foreground">عنصر</span></div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3"><b className="block text-lg">{s.kind}</b><span className="text-muted-foreground">النوع</span></div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3"><b className="block text-lg">{s.sortOrder}</b><span className="text-muted-foreground">الترتيب</span></div>
        </div>
      </div>
      <div className="grid gap-3 border-t border-white/10 p-4 md:grid-cols-2">
        <Field label="الاسم">
          <input className="input-base min-h-10 w-full" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
        </Field>
        <Field label="المسار">
          <input className="input-base min-h-10 w-full" dir="ltr" value={s.path} onChange={(e) => setS({ ...s, path: e.target.value })} />
        </Field>
        <Field label="التصنيف">
          <select className="input-base min-h-10 w-full" value={s.categoryId ?? ""} onChange={(e) => setS({ ...s, categoryId: e.target.value || null })}>
            <option value="">بدون تصنيف</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="صورة الغلاف">
          <input className="input-base min-h-10 w-full" value={s.thumbnail} onChange={(e) => setS({ ...s, thumbnail: e.target.value })} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-4">
        <label className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <input type="checkbox" checked={s.isActive} onChange={(e) => setS({ ...s, isActive: e.target.checked })} /> يظهر للمشاهدين
        </label>
        <div className="flex gap-2">
          <button className="btn-primary inline-flex items-center gap-2 rounded-2xl" onClick={() => onSave({ name: s.name, path: s.path, categoryId: s.categoryId, isActive: s.isActive, thumbnail: s.thumbnail, kind: s.kind, sortOrder: s.sortOrder })}>
            <Save className="h-4 w-4" /> حفظ
          </button>
          <ConfirmAction className="btn-ghost inline-flex items-center gap-2 rounded-2xl text-destructive" title="حذف المصدر؟" message="سيتم حذف المصدر من لوحة الإدارة فقط، ولن يتم حذف الملفات من القرص." confirmText="حذف" onConfirm={onDelete}>
            <Trash2 className="h-4 w-4" /> حذف
          </ConfirmAction>
        </div>
      </div>
    </div>
  );
}
