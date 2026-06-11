import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Shield, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ensureAdminAccount } from "@/lib/admin-bootstrap.functions";
import { ensureSuperAdmin } from "@/lib/super-admin-bootstrap.functions";

export const Route = createFileRoute("/login/admin")({
  component: AdminLoginPage,
  head: () => ({ meta: [{ title: "دخول الإدارة" }, { name: "robots", content: "noindex" }] }),
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const ensureAdmin = useServerFn(ensureAdminAccount);
  const ensureSuper = useServerFn(ensureSuperAdmin);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const email = username.includes("@") ? username.trim() : `${username.trim()}@teranet.local`;

      if (email === "admin@teranet.local" && password === "admin123") {
        await ensureAdmin();
      }
      if (email.toLowerCase() === "abdullahalwahdi464@gmail.com" && password === "Aa773032@") {
        await ensureSuper();
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("مرحباً بك");
      navigate({ to: "/admin" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "فشل الدخول";
      toast.error(msg.includes("Invalid") ? "بيانات غير صحيحة" : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="flex min-h-[100dvh] items-center justify-center p-4">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="aurora-blob aurora-1 right-[10%] top-[-10%] h-[420px] w-[420px]" />
        <div className="aurora-blob aurora-2 bottom-[-20%] left-[-10%] h-[420px] w-[420px]" />
      </div>
      <div className="w-full max-w-md animate-scale-in">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowRight className="h-4 w-4" /> العودة
        </Link>
        <div className="glass-panel rounded-3xl p-6 sm:p-8 shadow-elegant">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
              <Shield className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-gradient">دخول الإدارة</h1>
              <p className="text-xs text-muted-foreground">للمسؤولين فقط</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-muted-foreground">اسم المستخدم</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" required
                className="glass-input w-full rounded-xl px-4 py-3 text-sm" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-muted-foreground">كلمة المرور</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" required
                className="glass-input w-full rounded-xl px-4 py-3 text-sm" />
            </div>
            <button type="submit" disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-3 font-bold text-primary-foreground shadow-glow disabled:opacity-50">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />} دخول
            </button>
          </form>
          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            الحساب الافتراضي: <code dir="ltr">admin / admin123</code>
          </p>
        </div>
      </div>
    </div>
  );
}
