import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import {
  Radio, LogOut, Plus, Pencil, Trash2, Loader2,
  ArrowRight, Shield, Eye, EyeOff, GripVertical, X, Save,
  Download, MonitorPlay, Wifi, Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAllChannels, createChannel, updateChannel, deleteChannel,
  type Channel,
} from "@/lib/channels";
import { cn } from "@/lib/utils";

const BROADCASTER_DOWNLOAD_BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/releases`;

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "لوحة التحكم — تيرا نت" }] }),
});

const channelSchema = z.object({
  name: z.string().trim().min(1, "الاسم مطلوب").max(100),
  description: z.string().trim().max(255).default(""),
  streamUrl: z.string().trim().url("رابط غير صالح").max(2000),
  sortOrder: z.number().int().min(0).max(9999),
  isActive: z.boolean(),
});

function AdminPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Channel | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login/admin" });
  }, [loading, user, navigate]);

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["admin-channels"],
    queryFn: fetchAllChannels,
    enabled: !!user && isAdmin,
  });

  const createMut = useMutation({
    mutationFn: createChannel,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-channels"] });
      qc.invalidateQueries({ queryKey: ["public-channels"] });
      toast.success("تمت إضافة القناة");
      setShowForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<Channel, "id">> }) => updateChannel(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-channels"] });
      qc.invalidateQueries({ queryKey: ["public-channels"] });
      toast.success("تم تحديث القناة");
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: deleteChannel,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-channels"] });
      qc.invalidateQueries({ queryKey: ["public-channels"] });
      toast.success("تم حذف القناة");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  if (!isAdmin) {
    return (
      <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
        <Shield className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-extrabold">ليس لديك صلاحيات</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          حسابك مسجل لكنه ليس بصلاحيات أدمن. تحتاج لإضافة دور <code className="rounded bg-card px-1.5 py-0.5 text-primary">admin</code> لحسابك من قاعدة البيانات.
        </p>
        <div className="rounded-xl border border-border bg-card p-4 text-right text-xs font-mono break-all max-w-md">
          <div className="text-muted-foreground mb-1">معرّفك:</div>
          <div className="text-primary-glow">{user.id}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleLogout} className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-surface-2 transition">
            تسجيل خروج
          </button>
          <Link to="/" className="rounded-xl bg-gradient-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-glow">
            العودة للبث
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-[100dvh]">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="aurora-blob aurora-1 right-[5%] top-[-15%] h-[420px] w-[420px]" />
        <div className="aurora-blob aurora-3 bottom-[-20%] left-[-10%] h-[420px] w-[420px]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/10 bg-background/40 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow ring-1 ring-white/20">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="text-base font-extrabold sm:text-lg">لوحة التحكم</h1>
            <p className="text-[11px] text-muted-foreground">إدارة قنوات تيرا نت</p>
          </div>
          <Link to="/admin/iptv" className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-glow">
            <Radio className="h-3.5 w-3.5" /> IPTV السحابية
          </Link>
          <Link to="/" className="hidden sm:inline-flex items-center gap-1.5 rounded-xl glass-btn px-3 py-1.5 text-xs font-bold">
            <ArrowRight className="h-3.5 w-3.5" />
            البث
          </Link>
          <button onClick={handleLogout} className="inline-flex items-center gap-1.5 rounded-xl glass-btn px-3 py-1.5 text-xs font-bold">
            <LogOut className="h-3.5 w-3.5" />
            خروج
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold sm:text-2xl">القنوات</h2>
            <p className="text-sm text-muted-foreground">{channels.length} قناة</p>
          </div>
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-glow hover:opacity-90 transition"
          >
            <Plus className="h-4 w-4" />
            إضافة قناة
          </button>
        </div>

        <BroadcasterDownload />

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map((ch) => (
              <div key={ch.id} className={cn(
                "glass-panel rounded-2xl p-4 transition hover-lift",
                !ch.isActive && "opacity-60"
              )}>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Radio className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">{ch.name}</h3>
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">#{ch.sortOrder}</span>
                      {ch.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-live/15 px-2 py-0.5 text-[10px] font-bold text-live">
                          <Eye className="h-3 w-3" /> ظاهرة
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                          <EyeOff className="h-3 w-3" /> مخفية
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground truncate">{ch.description || "—"}</p>
                    <p className="mt-1 text-xs font-mono text-primary-glow/80 truncate" dir="ltr">{ch.streamUrl}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => { setEditing(ch); setShowForm(true); }}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground transition"
                      aria-label="تعديل"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`حذف "${ch.name}"؟`)) deleteMut.mutate(ch.id);
                      }}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition"
                      aria-label="حذف"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showForm && (
        <ChannelFormDialog
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSubmit={(data) => {
            if (editing) updateMut.mutate({ id: editing.id, data });
            else createMut.mutate(data);
          }}
          submitting={createMut.isPending || updateMut.isPending}
        />
      )}
    </div>
  );
}

function BroadcasterDownload() {
  const items = [
    { os: "Windows", file: "Manara-2.4.9-x64.zip", size: "135 MB", icon: "🪟" },
  ];
  return (
    <div className="mb-6 glass-panel rounded-3xl p-5 sm:p-6">
      <div className="flex items-start gap-3 sm:items-center">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow ring-1 ring-white/20">
          <MonitorPlay className="h-6 w-6 text-primary-foreground" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-extrabold sm:text-xl">برنامج البث المحلي</h3>
          <p className="text-xs text-muted-foreground sm:text-sm">
            ابث من جهازك (USB / شاشة / URL) لكل من على نفس شبكة Wi-Fi — بدون استهلاك إنترنت.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {items.map((it) => (
          <a
            key={it.file}
            href={`${BROADCASTER_DOWNLOAD_BASE}/${it.file}`}
            download
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:border-primary/40 hover:bg-primary/5"
          >
            <span className="text-2xl">{it.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">تحميل لـ {it.os}</p>
              <p className="font-num text-[11px] text-muted-foreground">{it.size}</p>
            </div>
            <Download className="h-5 w-5 text-primary-glow transition group-hover:translate-y-0.5" />
          </a>
        ))}
      </div>

      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
        <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
          <Download className="h-4 w-4 text-primary-glow" />
          <span><strong>1.</strong> فك ضغط الملف</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
          <Zap className="h-4 w-4 text-primary-glow" />
          <span><strong>2.</strong> شغّل Manara</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
          <Wifi className="h-4 w-4 text-primary-glow" />
          <span><strong>3.</strong> شارك الرابط على شبكتك</span>
        </div>
      </div>
    </div>
  );
}

function ChannelFormDialog({
  initial, onClose, onSubmit, submitting,
}: {
  initial: Channel | null;
  onClose: () => void;
  onSubmit: (data: Omit<Channel, "id">) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [streamUrl, setStreamUrl] = useState(initial?.streamUrl ?? "");
  const [sortOrder, setSortOrder] = useState(initial?.sortOrder ?? 0);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = channelSchema.safeParse({ name, description, streamUrl, sortOrder, isActive });
    if (!result.success) {
      toast.error(result.error.issues[0].message);
      return;
    }
    onSubmit(result.data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in-up" dir="rtl">
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-border bg-card shadow-elegant max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
          <h3 className="text-lg font-extrabold">{initial ? "تعديل القناة" : "قناة جديدة"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/5">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">اسم القناة *</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)} required maxLength={100}
              placeholder="تيرا 1"
              className="w-full rounded-xl border border-border bg-background/50 px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">الوصف</label>
            <input
              value={description} onChange={(e) => setDescription(e.target.value)} maxLength={255}
              placeholder="وصف مختصر"
              className="w-full rounded-xl border border-border bg-background/50 px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">رابط البث (m3u8) *</label>
            <input
              value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} required maxLength={2000}
              dir="ltr"
              placeholder="https://example.com/stream.m3u8"
              className="w-full rounded-xl border border-border bg-background/50 px-4 py-2.5 text-sm font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">الترتيب</label>
              <input
                type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))}
                min={0} max={9999}
                className="w-full rounded-xl border border-border bg-background/50 px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">الحالة</label>
              <button
                type="button"
                onClick={() => setIsActive((v) => !v)}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition",
                  isActive ? "border-live/30 bg-live/15 text-live" : "border-border bg-card text-muted-foreground"
                )}
              >
                {isActive ? <><Eye className="h-4 w-4" /> ظاهرة</> : <><EyeOff className="h-4 w-4" /> مخفية</>}
              </button>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold hover:bg-surface-2 transition">
              إلغاء
            </button>
            <button
              type="submit" disabled={submitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-glow hover:opacity-90 disabled:opacity-50 transition"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
