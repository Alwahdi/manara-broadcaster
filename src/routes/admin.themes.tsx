import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Plus, Trash2, Save } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { fetchAllThemes, createTheme, updateTheme, deleteTheme, activateTheme, type Theme } from "@/lib/themes";

export const Route = createFileRoute("/admin/themes")({
  component: () => <AdminShell title="العلامة التجارية والثيمات"><ThemesAdmin /></AdminShell>,
  head: () => ({ meta: [{ title: "العلامة — لوحة التحكم" }] }),
});

const blank = { name: "ثيم جديد", brandName: "تيرا نت", brandTagline: "شبكة البث المباشر", logoUrl: "", faviconUrl: "", primaryColor: "#3b82f6", accentColor: "#8b5cf6", bgColor: "#0a0f1f", fontFamily: "Cairo", isActive: false };

function ThemesAdmin() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["admin-themes"], queryFn: fetchAllThemes });
  const [draft, setDraft] = useState(blank);

  const inv = () => { qc.invalidateQueries({ queryKey: ["admin-themes"] }); qc.invalidateQueries({ queryKey: ["active-theme"] }); };
  const cMut = useMutation({ mutationFn: () => createTheme(draft), onSuccess: () => { toast.success("أُضيف الثيم"); inv(); setDraft(blank); }, onError: (e: Error) => toast.error(e.message) });
  const uMut = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<Theme, "id" | "isPreset">> }) => updateTheme(id, patch), onSuccess: () => { toast.success("تم الحفظ"); inv(); }, onError: (e: Error) => toast.error(e.message) });
  const dMut = useMutation({ mutationFn: deleteTheme, onSuccess: () => { toast.success("تم الحذف"); inv(); }, onError: (e: Error) => toast.error(e.message) });
  const aMut = useMutation({ mutationFn: activateTheme, onSuccess: () => { toast.success("تم التفعيل"); inv(); }, onError: (e: Error) => toast.error(e.message) });

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-2xl p-4 space-y-3">
        <h2 className="font-bold">ثيم جديد</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <input className="input-base" placeholder="اسم الثيم" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className="input-base" placeholder="اسم العلامة" value={draft.brandName} onChange={(e) => setDraft({ ...draft, brandName: e.target.value })} />
          <input className="input-base" placeholder="الشعار النصي" value={draft.brandTagline} onChange={(e) => setDraft({ ...draft, brandTagline: e.target.value })} />
          <ColorField label="اللون الأساسي" value={draft.primaryColor} onChange={(v) => setDraft({ ...draft, primaryColor: v })} />
          <ColorField label="اللون المساعد" value={draft.accentColor} onChange={(v) => setDraft({ ...draft, accentColor: v })} />
          <ColorField label="الخلفية" value={draft.bgColor} onChange={(v) => setDraft({ ...draft, bgColor: v })} />
          <input className="input-base" placeholder="رابط الشعار" value={draft.logoUrl} onChange={(e) => setDraft({ ...draft, logoUrl: e.target.value })} />
          <input className="input-base" placeholder="رابط الأيقونة" value={draft.faviconUrl} onChange={(e) => setDraft({ ...draft, faviconUrl: e.target.value })} />
          <input className="input-base" placeholder="الخط (Cairo)" value={draft.fontFamily} onChange={(e) => setDraft({ ...draft, fontFamily: e.target.value })} />
        </div>
        <button onClick={() => cMut.mutate()} disabled={cMut.isPending} className="btn-primary inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> إضافة
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {isLoading && <div className="text-sm text-muted-foreground">جارٍ التحميل…</div>}
        {data.map((t) => (
          <ThemeCard key={t.id} theme={t}
            onSave={(patch) => uMut.mutate({ id: t.id, patch })}
            onActivate={() => aMut.mutate(t.id)}
            onDelete={() => dMut.mutate(t.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-24 text-muted-foreground">{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-10 rounded cursor-pointer bg-transparent" />
      <input className="input-base flex-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function ThemeCard({ theme, onSave, onActivate, onDelete }: { theme: Theme; onSave: (p: Partial<Omit<Theme, "id" | "isPreset">>) => void; onActivate: () => void; onDelete: () => void }) {
  const [t, setT] = useState(theme);
  return (
    <div className="glass-panel rounded-2xl p-4 space-y-3" style={{ borderColor: t.isActive ? t.primaryColor : undefined }}>
      <div className="flex items-center gap-2">
        <div className="h-10 w-10 rounded-xl" style={{ background: `linear-gradient(135deg, ${t.primaryColor}, ${t.accentColor})` }} />
        <div className="flex-1">
          <div className="font-bold flex items-center gap-2">{t.brandName} {t.isActive && <span className="text-[10px] text-emerald-400 inline-flex items-center gap-0.5"><Check className="h-3 w-3" /> مفعّل</span>}</div>
          <div className="text-xs text-muted-foreground">{t.name}</div>
        </div>
      </div>
      <input className="input-base" placeholder="اسم العلامة" value={t.brandName} onChange={(e) => setT({ ...t, brandName: e.target.value })} />
      <input className="input-base" placeholder="الشعار النصي" value={t.brandTagline} onChange={(e) => setT({ ...t, brandTagline: e.target.value })} />
      <div className="grid grid-cols-3 gap-2">
        <input type="color" value={t.primaryColor} onChange={(e) => setT({ ...t, primaryColor: e.target.value })} className="h-9 w-full rounded cursor-pointer bg-transparent" />
        <input type="color" value={t.accentColor} onChange={(e) => setT({ ...t, accentColor: e.target.value })} className="h-9 w-full rounded cursor-pointer bg-transparent" />
        <input type="color" value={t.bgColor} onChange={(e) => setT({ ...t, bgColor: e.target.value })} className="h-9 w-full rounded cursor-pointer bg-transparent" />
      </div>
      <input className="input-base" placeholder="رابط الشعار" value={t.logoUrl} onChange={(e) => setT({ ...t, logoUrl: e.target.value })} />
      <div className="flex gap-2">
        <button className="btn-primary inline-flex items-center gap-1" onClick={() => onSave({ brandName: t.brandName, brandTagline: t.brandTagline, primaryColor: t.primaryColor, accentColor: t.accentColor, bgColor: t.bgColor, logoUrl: t.logoUrl })}>
          <Save className="h-4 w-4" /> حفظ
        </button>
        {!t.isActive && <button className="btn-ghost" onClick={onActivate}>تفعيل</button>}
        {!t.isPreset && <button className="btn-ghost text-destructive" onClick={() => confirm("حذف؟") && onDelete()}><Trash2 className="h-4 w-4" /></button>}
      </div>
    </div>
  );
}
