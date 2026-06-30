import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Shield, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT, pageTitle } from "@/lib/product";

export const Route = createFileRoute("/login/admin")({
  component: AdminLoginPage,
  head: () => ({ meta: [{ title: pageTitle("دخول الإدارة") }, { name: "robots", content: "noindex" }] }),
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const email = username.trim().toLowerCase();
      if (!email.includes("@")) throw new Error("استخدم البريد الإلكتروني الكامل لحساب الإدارة.");

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
              <p className="text-xs text-muted-foreground">{PRODUCT.adminName} · للمسؤولين فقط</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-muted-foreground">اسم المستخدم</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" required type="email" autoComplete="username"
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
          <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-center text-[11px] text-amber-100">
            هذه الصفحة للإدارة فقط. لا تنشر رابط الإدارة على الإنترنت العام، واستخدم حساباً مفعلاً من مالك المنصة.
          </p>
        </div>
      </div>
    </div>
  );
}
