import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { fetchLicenses, createLicense, updateLicense, deleteLicense, generateLicenseKey, type License } from "@/lib/licenses";
import { toast } from "sonner";
import { Copy, Plus, Trash2, RefreshCw } from "lucide-react";
import { PRODUCT } from "@/lib/product";
import { ConfirmAction } from "@/components/ConfirmAction";

export const Route = createFileRoute("/admin/licenses")({ component: AdminLicensesPage });

const PLANS = ["trial", "basic", "pro", "enterprise", "lifetime_basic", "lifetime_pro", "lifetime_enterprise"];
const STATUSES = ["active", "suspended", "expired", "revoked"];
const CYCLES = ["monthly", "yearly", "lifetime"];

function emptyDraft(): Partial<License> {
  return {
    license_key: generateLicenseKey(),
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    organization: "",
    plan: "pro",
    billing_cycle: "monthly",
    max_channels: 8,
    max_library_items: 1000,
    white_label: false,
    status: "active",
    notes: "",
    expires_at: null,
  };
}

function AdminLicensesPage() {
  const qc = useQueryClient();
  const { data: licenses = [], isLoading } = useQuery({ queryKey: ["licenses"], queryFn: fetchLicenses });
  const [draft, setDraft] = useState<Partial<License>>(emptyDraft());
  const [showForm, setShowForm] = useState(false);

  async function handleCreate() {
    if (!draft.customer_name) { toast.error("اسم العميل مطلوب"); return; }
    try {
      await createLicense(draft);
      toast.success("تم إصدار الترخيص");
      setDraft(emptyDraft());
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["licenses"] });
    } catch (e: unknown) { toast.error((e as Error).message); }
  }

  async function handleUpdate(id: string, patch: Partial<License>) {
    try {
      await updateLicense(id, patch);
      qc.invalidateQueries({ queryKey: ["licenses"] });
    } catch (e: unknown) { toast.error((e as Error).message); }
  }

  async function handleDelete(id: string) {
    await deleteLicense(id);
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["licenses"] });
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    toast.success("تم نسخ المفتاح");
  }

  return (
    <AdminShell title="إدارة التراخيص">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">التراخيص الصادرة</h2>
          <p className="text-sm text-muted-foreground">إصدار وإدارة مفاتيح تفعيل تطبيق {PRODUCT.name} للعملاء</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-glow">
          <Plus className="h-4 w-4" /> ترخيص جديد
        </button>
      </div>

      {showForm && (
        <div className="glass-panel rounded-2xl p-5 mb-6 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="مفتاح الترخيص">
              <div className="flex gap-2">
                <input className="input-base" value={draft.license_key ?? ""} onChange={(e) => setDraft({ ...draft, license_key: e.target.value })} />
                <button onClick={() => setDraft({ ...draft, license_key: generateLicenseKey() })} className="rounded-lg glass px-3"><RefreshCw className="h-4 w-4" /></button>
              </div>
            </Field>
            <Field label="اسم العميل *"><input className="input-base" value={draft.customer_name ?? ""} onChange={(e) => setDraft({ ...draft, customer_name: e.target.value })} /></Field>
            <Field label="الإيميل"><input className="input-base" type="email" value={draft.customer_email ?? ""} onChange={(e) => setDraft({ ...draft, customer_email: e.target.value })} /></Field>
            <Field label="الهاتف"><input className="input-base" value={draft.customer_phone ?? ""} onChange={(e) => setDraft({ ...draft, customer_phone: e.target.value })} /></Field>
            <Field label="المؤسسة / الشبكة"><input className="input-base" value={draft.organization ?? ""} onChange={(e) => setDraft({ ...draft, organization: e.target.value })} /></Field>
            <Field label="الخطة">
              <select className="input-base" value={draft.plan} onChange={(e) => setDraft({ ...draft, plan: e.target.value })}>
                {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="دورة الفوترة">
              <select className="input-base" value={draft.billing_cycle} onChange={(e) => setDraft({ ...draft, billing_cycle: e.target.value })}>
                {CYCLES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="عدد القنوات الأقصى"><input className="input-base" type="number" value={draft.max_channels ?? 0} onChange={(e) => setDraft({ ...draft, max_channels: Number(e.target.value) })} /></Field>
            <Field label="عدد عناصر المكتبة الأقصى"><input className="input-base" type="number" value={draft.max_library_items ?? 0} onChange={(e) => setDraft({ ...draft, max_library_items: Number(e.target.value) })} /></Field>
            <Field label="تاريخ الانتهاء (اتركه فارغاً لمدى الحياة)">
              <input className="input-base" type="datetime-local" value={draft.expires_at?.slice(0, 16) ?? ""} onChange={(e) => setDraft({ ...draft, expires_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!draft.white_label} onChange={(e) => setDraft({ ...draft, white_label: e.target.checked })} />
              تخصيص كامل (White-label)
            </label>
          </div>
          <Field label="ملاحظات"><textarea className="input-base min-h-[60px]" value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setDraft(emptyDraft()); setShowForm(false); }} className="rounded-full glass px-4 py-2 text-sm font-bold">إلغاء</button>
            <button onClick={handleCreate} className="rounded-full bg-gradient-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-glow">إصدار الترخيص</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">جاري التحميل...</p>
      ) : licenses.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">لا يوجد تراخيص بعد</p>
      ) : (
        <div className="space-y-3">
          {licenses.map((lic) => (
            <div key={lic.id} className="glass-panel rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <code className="text-xs bg-white/5 rounded px-2 py-1 font-mono">{lic.license_key}</code>
                    <button onClick={() => copyKey(lic.license_key)} className="text-muted-foreground hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button>
                    <span className={`text-[10px] rounded-full px-2 py-0.5 font-bold ${
                      lic.status === "active" ? "bg-emerald-500/15 text-emerald-400" :
                      lic.status === "suspended" ? "bg-amber-500/15 text-amber-400" :
                      "bg-red-500/15 text-red-400"
                    }`}>{lic.status}</span>
                    <span className="text-[10px] rounded-full bg-primary/15 text-primary-glow px-2 py-0.5 font-bold">{lic.plan}</span>
                  </div>
                  <div className="font-bold">{lic.customer_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {lic.organization && <span>{lic.organization} · </span>}
                    {lic.customer_email && <span>{lic.customer_email} · </span>}
                    {lic.customer_phone}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {lic.max_channels} قناة · {lic.max_library_items} عنصر مكتبة
                    {lic.expires_at ? ` · ينتهي: ${new Date(lic.expires_at).toLocaleDateString("ar")}` : " · مدى الحياة"}
                    {lic.hardware_id && ` · مفعّل (HW: ${lic.hardware_id.slice(0, 12)}...)`}
                  </div>
                </div>
                <div className="flex gap-2">
                  <select value={lic.status} onChange={(e) => handleUpdate(lic.id, { status: e.target.value })} className="input-base text-xs h-8">
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ConfirmAction
                    className="rounded-lg glass p-2 text-red-400 hover:bg-red-500/10"
                    title="حذف الترخيص؟"
                    message={`سيتم حذف ترخيص ${lic.customer_name || lic.license_key} نهائياً.`}
                    confirmText="حذف"
                    onConfirm={() => handleDelete(lic.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </ConfirmAction>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-muted-foreground mb-1 block">{label}</span>
      {children}
    </label>
  );
}
