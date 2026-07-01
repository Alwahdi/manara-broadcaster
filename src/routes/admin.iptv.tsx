import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Radio, ArrowRight, Shield, Loader2, Plus, Pencil, Trash2,
  Eye, EyeOff, Save, X, Upload, Copy as CopyIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAllCloudIptv, createCloudIptv, updateCloudIptv, deleteCloudIptv,
  parseM3U, type CloudIptvChannel, type CloudIptvInput,
} from "@/lib/cloud-iptv";
import { cn } from "@/lib/utils";
import { pageTitle } from "@/lib/product";
import { ConfirmAction } from "@/components/ConfirmAction";

export const Route = createFileRoute("/admin/iptv")({
  component: AdminIptvPage,
  head: () => ({ meta: [
    { title: pageTitle("إدارة البث التلفزيوني السحابي") },
    { name: "robots", content: "noindex" },
  ] }),
});

const EMPTY: CloudIptvInput = {
  name: "",
  url: "",
  logoUrl: "",
  category: "",
  headers: {},
  isActive: true,
  targetLicenses: null,
  sortOrder: 0,
  notes: "",
};

function AdminIptvPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CloudIptvChannel | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login/admin" });
  }, [loading, user, navigate]);

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["admin-cloud-iptv"],
    queryFn: fetchAllCloudIptv,
    enabled: !!user && isAdmin,
  });

  const createMut = useMutation({
    mutationFn: createCloudIptv,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-cloud-iptv"] }); toast.success("تمت الإضافة"); setShowForm(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CloudIptvInput> }) => updateCloudIptv(id, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-cloud-iptv"] }); toast.success("تم التحديث"); setEditing(null); setShowForm(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: deleteCloudIptv,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-cloud-iptv"] }); toast.success("تم الحذف"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return null;
  if (!isAdmin) {
    return (
      <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
        <Shield className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-extrabold">ليس لديك صلاحيات</h1>
        <Link to="/" className="rounded-xl bg-gradient-primary px-4 py-2 text-sm font-bold text-primary-foreground">العودة</Link>
      </div>
    );
  }

  const handleSave = (data: CloudIptvInput) => {
    if (editing) updateMut.mutate({ id: editing.id, patch: data });
    else createMut.mutate(data);
  };

  return (
    <div dir="rtl" className="min-h-[100dvh]">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="aurora-blob aurora-1 right-[5%] top-[-15%] h-[420px] w-[420px]" />
        <div className="aurora-blob aurora-3 bottom-[-20%] left-[-10%] h-[420px] w-[420px]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/10 bg-background/40 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow ring-1 ring-white/20">
            <Radio className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="text-base font-extrabold sm:text-lg">البث التلفزيوني السحابي</h1>
            <p className="text-[11px] text-muted-foreground">القنوات تُدار من هنا وتظهر تلقائياً عند جميع المشتركين</p>
          </div>
          <Link to="/admin" className="hidden sm:inline-flex items-center gap-1.5 rounded-xl glass-btn px-3 py-1.5 text-xs font-bold">
            <ArrowRight className="h-3.5 w-3.5" /> الإدارة
          </Link>
          <button onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }} className="inline-flex items-center gap-1.5 rounded-xl glass-btn px-3 py-1.5 text-xs font-bold">خروج</button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold sm:text-2xl">قنوات البث التلفزيوني السحابي</h2>
            <p className="text-sm text-muted-foreground">{channels.length} قناة</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowImport(true)} className="inline-flex items-center gap-1.5 rounded-xl glass-btn px-3 py-2 text-sm font-bold">
              <Upload className="h-4 w-4" /> استيراد M3U
            </button>
            <button onClick={() => { setEditing(null); setShowForm(true); }} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-glow">
              <Plus className="h-4 w-4" /> إضافة قناة
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : channels.length === 0 ? (
          <div className="glass-panel rounded-2xl p-10 text-center">
            <Radio className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-3 text-muted-foreground">لا توجد قنوات بعد. أضف أول قناة لتظهر عند جميع المشتركين.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map((ch) => (
              <div key={ch.id} className={cn("glass-panel rounded-2xl p-4 transition", !ch.isActive && "opacity-60")}>
                <div className="flex items-start gap-3">
                  {ch.logoUrl ? (
                    <img src={ch.logoUrl} alt="" className="h-10 w-10 rounded-lg object-cover bg-white/5" />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Radio className="h-5 w-5 text-primary" /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">{ch.name}</h3>
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">#{ch.sortOrder}</span>
                      {ch.category && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{ch.category}</span>}
                      {ch.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-live/15 px-2 py-0.5 text-[10px] font-bold text-live"><Eye className="h-3 w-3" /> ظاهرة</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground"><EyeOff className="h-3 w-3" /> مخفية</span>
                      )}
                      {ch.targetLicenses && ch.targetLicenses.length > 0 && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">{ch.targetLicenses.length} ترخيص محدد</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs font-mono text-primary-glow/80 truncate" dir="ltr">{ch.url}</p>
                    {ch.notes && <p className="mt-1 text-xs text-muted-foreground">{ch.notes}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => navigator.clipboard.writeText(ch.url).then(() => toast.success("نُسخ"))} className="rounded-lg glass-btn p-2" title="نسخ"><CopyIcon className="h-4 w-4" /></button>
                    <button onClick={() => { setEditing(ch); setShowForm(true); }} className="rounded-lg glass-btn p-2"><Pencil className="h-4 w-4" /></button>
                    <ConfirmAction
                      className="rounded-lg glass-btn p-2 text-destructive"
                      title="حذف قناة بث؟"
                      message={`سيتم حذف "${ch.name}" من القنوات السحابية.`}
                      confirmText="حذف"
                      onConfirm={() => deleteMut.mutate(ch.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </ConfirmAction>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showForm && (
        <ChannelForm
          initial={editing ?? EMPTY}
          isEdit={!!editing}
          busy={createMut.isPending || updateMut.isPending}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
      {showImport && (
        <ImportDialog
          onClose={() => setShowImport(false)}
          onImport={async (items) => {
            let ok = 0;
            for (const it of items) {
              try { await createCloudIptv({ ...EMPTY, ...it }); ok++; } catch { /* skip */ }
            }
            qc.invalidateQueries({ queryKey: ["admin-cloud-iptv"] });
            toast.success(`تم استيراد ${ok} قناة`);
            setShowImport(false);
          }}
        />
      )}
    </div>
  );
}

function ChannelForm({ initial, isEdit, busy, onSave, onClose }: {
  initial: CloudIptvInput | CloudIptvChannel;
  isEdit: boolean;
  busy: boolean;
  onSave: (data: CloudIptvInput) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [url, setUrl] = useState(initial.url);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [category, setCategory] = useState(initial.category);
  const [isActive, setIsActive] = useState(initial.isActive);
  const [sortOrder, setSortOrder] = useState(initial.sortOrder);
  const [notes, setNotes] = useState(initial.notes);
  const [targetLicensesText, setTargetLicensesText] = useState((initial.targetLicenses ?? []).join("\n"));
  const [headersText, setHeadersText] = useState(JSON.stringify(initial.headers ?? {}, null, 2));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) { toast.error("الاسم والرابط مطلوبان"); return; }
    let headers: Record<string, string> = {};
    try { headers = headersText.trim() ? JSON.parse(headersText) : {}; }
    catch { toast.error("صيغة Headers غير صالحة (JSON)"); return; }
    const targets = targetLicensesText.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    onSave({
      name: name.trim(), url: url.trim(), logoUrl: logoUrl.trim(), category: category.trim(),
      headers, isActive, sortOrder: Number(sortOrder) || 0, notes: notes.trim(),
      targetLicenses: targets.length ? targets : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="glass-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-5" dir="rtl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{isEdit ? "تعديل قناة" : "قناة جديدة"}</h3>
          <button type="button" onClick={onClose} className="rounded-lg glass-btn p-2"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-bold text-muted-foreground">الاسم *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-border bg-surface-1 px-3 py-2 text-sm" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-bold text-muted-foreground">رابط البث *</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} className="w-full rounded-xl border border-border bg-surface-1 px-3 py-2 text-sm font-mono" dir="ltr" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-muted-foreground">رابط الشعار</span>
            <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className="w-full rounded-xl border border-border bg-surface-1 px-3 py-2 text-sm font-mono" dir="ltr" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-muted-foreground">التصنيف</span>
            <input value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-xl border border-border bg-surface-1 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-muted-foreground">الترتيب</span>
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className="w-full rounded-xl border border-border bg-surface-1 px-3 py-2 text-sm" />
          </label>
          <label className="flex items-center gap-2 self-end pb-2">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
            <span className="text-sm font-bold">مفعّلة وظاهرة للمشتركين</span>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-bold text-muted-foreground">ترويسات مخصصة بصيغة JSON اختيارية، مثل وكيل المستخدم أو المُحيل</span>
            <textarea value={headersText} onChange={(e) => setHeadersText(e.target.value)} rows={3} className="w-full rounded-xl border border-border bg-surface-1 px-3 py-2 text-xs font-mono" dir="ltr" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-bold text-muted-foreground">مفاتيح تراخيص محددة (اختياري — اتركه فارغاً للسماح للجميع)</span>
            <textarea value={targetLicensesText} onChange={(e) => setTargetLicensesText(e.target.value)} rows={2} placeholder="مفتاح في كل سطر" className="w-full rounded-xl border border-border bg-surface-1 px-3 py-2 text-xs font-mono" dir="ltr" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-bold text-muted-foreground">ملاحظات داخلية</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-xl border border-border bg-surface-1 px-3 py-2 text-sm" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl glass-btn px-4 py-2 text-sm font-bold">إلغاء</button>
          <button disabled={busy} type="submit" className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-glow disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ
          </button>
        </div>
      </form>
    </div>
  );
}

function ImportDialog({ onClose, onImport }: { onClose: () => void; onImport: (items: ReturnType<typeof parseM3U>) => void; }) {
  const [text, setText] = useState("");
  const items = text.trim() ? parseM3U(text) : [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="glass-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-5" dir="rtl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">استيراد قائمة M3U</h3>
          <button onClick={onClose} className="rounded-lg glass-btn p-2"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">الصق محتوى ملف <code>.m3u</code> / <code>.m3u8</code> هنا</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} className="w-full rounded-xl border border-border bg-surface-1 px-3 py-2 text-xs font-mono" dir="ltr" placeholder="#EXTM3U..." />
        <div className="mt-2 text-xs text-muted-foreground">سيتم استيراد <span className="font-bold text-primary">{items.length}</span> قناة</div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl glass-btn px-4 py-2 text-sm font-bold">إلغاء</button>
          <button onClick={() => onImport(items)} disabled={items.length === 0} className="rounded-xl bg-gradient-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-glow disabled:opacity-50">استيراد</button>
        </div>
      </div>
    </div>
  );
}
