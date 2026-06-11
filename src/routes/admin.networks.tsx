import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { fetchAllNetworks, createNetwork, updateNetwork, deleteNetwork, type SubscriberNetwork } from "@/lib/networks";
import { toast } from "sonner";
import { Plus, Trash2, MapPin, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/admin/networks")({ component: AdminNetworksPage });

function emptyDraft(): Partial<SubscriberNetwork> {
  return { name: "", city: "", country: "", latitude: 24.7136, longitude: 46.6753, logo_url: "", website: "", plan: "pro", is_visible: true, sort_order: 0 };
}

function AdminNetworksPage() {
  const qc = useQueryClient();
  const { data: networks = [], isLoading } = useQuery({ queryKey: ["networks-all"], queryFn: fetchAllNetworks });
  const [draft, setDraft] = useState<Partial<SubscriberNetwork>>(emptyDraft());
  const [showForm, setShowForm] = useState(false);

  async function handleCreate() {
    if (!draft.name) { toast.error("الاسم مطلوب"); return; }
    try {
      await createNetwork(draft);
      toast.success("تمت إضافة الشبكة");
      setDraft(emptyDraft());
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["networks-all"] });
      qc.invalidateQueries({ queryKey: ["public-networks"] });
    } catch (e: unknown) { toast.error((e as Error).message); }
  }

  async function handleToggle(id: string, is_visible: boolean) {
    await updateNetwork(id, { is_visible });
    qc.invalidateQueries({ queryKey: ["networks-all"] });
    qc.invalidateQueries({ queryKey: ["public-networks"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("حذف هذه الشبكة من الخريطة؟")) return;
    await deleteNetwork(id);
    qc.invalidateQueries({ queryKey: ["networks-all"] });
    qc.invalidateQueries({ queryKey: ["public-networks"] });
    toast.success("تم الحذف");
  }

  return (
    <AdminShell title="الشبكات على الخريطة">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">الشبكات المشتركة</h2>
          <p className="text-sm text-muted-foreground">الشبكات اللي تظهر على خريطة الصفحة الرئيسية</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-glow">
          <Plus className="h-4 w-4" /> شبكة جديدة
        </button>
      </div>

      {showForm && (
        <div className="glass-panel rounded-2xl p-5 mb-6 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="اسم الشبكة *"><input className="input-base" value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="الخطة">
              <select className="input-base" value={draft.plan} onChange={(e) => setDraft({ ...draft, plan: e.target.value })}>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
                <option value="lifetime">Lifetime</option>
              </select>
            </Field>
            <Field label="المدينة"><input className="input-base" value={draft.city ?? ""} onChange={(e) => setDraft({ ...draft, city: e.target.value })} /></Field>
            <Field label="الدولة"><input className="input-base" value={draft.country ?? ""} onChange={(e) => setDraft({ ...draft, country: e.target.value })} /></Field>
            <Field label="خط العرض (Latitude)"><input className="input-base" type="number" step="any" value={draft.latitude ?? 0} onChange={(e) => setDraft({ ...draft, latitude: Number(e.target.value) })} /></Field>
            <Field label="خط الطول (Longitude)"><input className="input-base" type="number" step="any" value={draft.longitude ?? 0} onChange={(e) => setDraft({ ...draft, longitude: Number(e.target.value) })} /></Field>
            <Field label="رابط الشعار (اختياري)"><input className="input-base" value={draft.logo_url ?? ""} onChange={(e) => setDraft({ ...draft, logo_url: e.target.value })} /></Field>
            <Field label="الموقع الإلكتروني (اختياري)"><input className="input-base" value={draft.website ?? ""} onChange={(e) => setDraft({ ...draft, website: e.target.value })} /></Field>
          </div>
          <p className="text-xs text-muted-foreground">
            💡 لإيجاد الإحداثيات: افتح <a className="underline text-primary-glow" href="https://www.openstreetmap.org" target="_blank" rel="noreferrer">OpenStreetMap</a>،
            ابحث عن المدينة، انقر بالزر الأيمن على الموقع واختر "إظهار العنوان" — ستظهر الإحداثيات في URL.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setDraft(emptyDraft()); setShowForm(false); }} className="rounded-full glass px-4 py-2 text-sm font-bold">إلغاء</button>
            <button onClick={handleCreate} className="rounded-full bg-gradient-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-glow">إضافة</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">جاري التحميل...</p>
      ) : networks.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">لم تُضف شبكات بعد</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {networks.map((n) => (
            <div key={n.id} className="glass-panel rounded-2xl p-4 flex items-start gap-3">
              <MapPin className="h-5 w-5 text-primary-glow shrink-0 mt-1" />
              <div className="flex-1 min-w-0">
                <div className="font-bold flex items-center gap-2">
                  {n.name}
                  <span className="text-[10px] rounded-full bg-primary/15 text-primary-glow px-2 py-0.5 font-bold">{n.plan}</span>
                </div>
                <div className="text-xs text-muted-foreground">{n.city}{n.city && n.country ? "، " : ""}{n.country}</div>
                <div className="text-[10px] text-muted-foreground mt-1 font-mono">{n.latitude.toFixed(4)}, {n.longitude.toFixed(4)}</div>
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => handleToggle(n.id, !n.is_visible)} className="rounded-lg glass p-2" title={n.is_visible ? "إخفاء" : "إظهار"}>
                  {n.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                </button>
                <button onClick={() => handleDelete(n.id)} className="rounded-lg glass p-2 text-red-400 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-bold text-muted-foreground mb-1 block">{label}</span>{children}</label>;
}
