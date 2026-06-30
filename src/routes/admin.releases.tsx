import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/AdminShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download, Trash2, UploadCloud, Copy } from "lucide-react";
import { PRODUCT } from "@/lib/product";
import { ConfirmAction } from "@/components/ConfirmAction";

export const Route = createFileRoute("/admin/releases")({
  component: ReleasesPage,
});

type ReleaseFile = { name: string; size: number; updatedAt: string; url: string };

const BUCKET = "releases";
const PROJECT_REF = "yvfyvanvkjrgapufatnn";
const PUBLIC_BASE = `https://${PROJECT_REF}.supabase.co/storage/v1/object/public/${BUCKET}`;

function ReleasesPage() {
  const [files, setFiles] = useState<ReleaseFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [installer, setInstaller] = useState<File | null>(null);
  const [latestYml, setLatestYml] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function refresh() {
    setLoading(true);
    const { data, error } = await supabase.storage.from(BUCKET).list("", {
      limit: 100,
      sortBy: { column: "updated_at", order: "desc" },
    });
    if (error) { toast.error(error.message); setLoading(false); return; }
    setFiles((data || []).filter((f) => f.name && !f.name.startsWith(".")).map((f) => ({
      name: f.name,
      size: (f.metadata as { size?: number } | null)?.size ?? 0,
      updatedAt: f.updated_at || "",
      url: `${PUBLIC_BASE}/${encodeURIComponent(f.name)}`,
    })));
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  async function uploadOne(file: File) {
    const { error } = await supabase.storage.from(BUCKET).upload(file.name, file, {
      upsert: true,
      cacheControl: "60",
      contentType: file.name.endsWith(".yml") ? "text/yaml" : "application/octet-stream",
    });
    if (error) throw error;
  }

  async function handleUpload() {
    if (!installer && !latestYml) { toast.error("اختر ملف installer أو latest.yml"); return; }
    setUploading(true);
    try {
      if (installer) await uploadOne(installer);
      if (latestYml) await uploadOne(latestYml);
      toast.success("تم رفع الإصدار. جميع التطبيقات ستحدّث تلقائياً خلال 6 ساعات.");
      setInstaller(null); setLatestYml(null);
      await refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "فشل الرفع");
    } finally { setUploading(false); }
  }

  async function deleteFile(name: string) {
    const { error } = await supabase.storage.from(BUCKET).remove([name]);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحذف");
    refresh();
  }

  function fmtSize(b: number) {
    if (!b) return "—";
    if (b > 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + " MB";
    if (b > 1024) return (b / 1024).toFixed(1) + " KB";
    return b + " B";
  }

  const installerFiles = files.filter((f) => f.name.endsWith(".exe"));
  const latestYmlFile = files.find((f) => f.name === "latest.yml");

  return (
    <AdminShell title="إدارة الإصدارات">
      <div className="grid gap-6">
        <div className="glass-panel rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-2 flex items-center gap-2"><UploadCloud className="h-5 w-5 text-primary" />رفع إصدار {PRODUCT.name} جديد</h2>
          <p className="text-sm text-muted-foreground mb-4">
            ابنِ على ويندوز عبر <code>npm run dist</code> داخل <code>electron-broadcaster/</code>،
            ثم ارفع ملفي <code>WIVA-Setup-x.x.x.exe</code> و <code>latest.yml</code> هنا.
            جميع أجهزة العملاء ستفحص التحديث وتنزّله تلقائياً.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">ملف التثبيت (.exe)</Label>
              <Input type="file" accept=".exe" onChange={(e) => setInstaller(e.target.files?.[0] || null)} />
              {installer && <div className="text-xs text-muted-foreground mt-1">{installer.name} — {fmtSize(installer.size)}</div>}
            </div>
            <div>
              <Label className="text-xs">latest.yml</Label>
              <Input type="file" accept=".yml,.yaml" onChange={(e) => setLatestYml(e.target.files?.[0] || null)} />
              {latestYml && <div className="text-xs text-muted-foreground mt-1">{latestYml.name} — {fmtSize(latestYml.size)}</div>}
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={handleUpload} disabled={uploading}>{uploading ? "جارٍ الرفع…" : "رفع للسحابة"}</Button>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">الملفات الحالية</h2>
            <div className="text-xs text-muted-foreground">
              {latestYmlFile ? `latest.yml متوفر · ${installerFiles.length} مثبّت` : "⚠️ لا يوجد latest.yml — التحديث التلقائي معطّل"}
            </div>
          </div>
          {loading ? <div className="text-sm text-muted-foreground">جارٍ التحميل…</div> : (
            <div className="grid gap-2">
              {files.length === 0 && <div className="text-sm text-muted-foreground">لا توجد إصدارات بعد.</div>}
              {files.map((f) => (
                <div key={f.name} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{f.name}</div>
                    <div className="text-xs text-muted-foreground">{fmtSize(f.size)} · {f.updatedAt && new Date(f.updatedAt).toLocaleString("ar")}</div>
                  </div>
                  <button onClick={() => { navigator.clipboard.writeText(f.url); toast.success("تم نسخ الرابط"); }} className="p-2 rounded-lg hover:bg-white/10" title="نسخ الرابط"><Copy className="h-4 w-4" /></button>
                  <a href={f.url} target="_blank" rel="noreferrer" className="p-2 rounded-lg hover:bg-white/10" title="تنزيل"><Download className="h-4 w-4" /></a>
                  <ConfirmAction
                    className="p-2 rounded-lg hover:bg-destructive/20 text-destructive"
                    title="حذف ملف الإصدار؟"
                    message={`سيتم حذف ${f.name} من ملفات التحديث.`}
                    confirmText="حذف"
                    onConfirm={() => deleteFile(f.name)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </ConfirmAction>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
