import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Radio, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT, pageTitle } from "@/lib/product";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [{ title: pageTitle("تسجيل الدخول") }],
  }),
});

const schema = z.object({
  email: z.string().trim().email("بريد إلكتروني غير صالح").max(255),
  password: z.string().min(6, "كلمة المرور 6 أحرف على الأقل").max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate({ to: "/admin" });
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = schema.safeParse({ email, password });
    if (!result.success) {
      toast.error(result.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: result.data.email,
          password: result.data.password,
          options: { emailRedirectTo: `${window.location.origin}/admin` },
        });
        if (error) throw error;
        toast.success("تم إنشاء الحساب بنجاح");
        navigate({ to: "/admin" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: result.data.email,
          password: result.data.password,
        });
        if (error) throw error;
        toast.success("مرحباً بعودتك");
        navigate({ to: "/admin" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "حدث خطأ";
      if (msg.includes("Invalid login")) toast.error("بيانات الدخول غير صحيحة");
      else if (msg.includes("already registered")) toast.error("هذا البريد مسجل مسبقاً");
      else toast.error(msg);
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
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
          <ArrowRight className="h-4 w-4" />
          العودة للبث
        </Link>

        <div className="glass-panel rounded-3xl p-6 sm:p-8 shadow-elegant">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow ring-1 ring-white/20">
              <Radio className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-gradient">{PRODUCT.name}</h1>
              <p className="text-xs text-muted-foreground">لوحة تحكم الأدمن</p>
            </div>
          </div>

          <h2 className="mb-1 text-2xl font-extrabold tracking-tight">
            {mode === "signin" ? "تسجيل الدخول" : "إنشاء حساب"}
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            {mode === "signin" ? "ادخل بياناتك للوصول إلى لوحة التحكم" : "أنشئ حسابك للبدء"}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-muted-foreground">البريد الإلكتروني</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                dir="ltr"
                required
                className="glass-input w-full rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-muted-foreground">كلمة المرور</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                dir="ltr"
                required
                minLength={6}
                className="glass-input w-full rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-3 font-bold text-primary-foreground shadow-glow transition hover:scale-[1.01] active:scale-100 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "دخول" : "إنشاء حساب"}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "signin" ? (
              <>
                ليس لديك حساب؟{" "}
                <button onClick={() => setMode("signup")} className="font-bold text-primary-glow hover:underline">
                  إنشاء حساب
                </button>
              </>
            ) : (
              <>
                لديك حساب؟{" "}
                <button onClick={() => setMode("signin")} className="font-bold text-primary-glow hover:underline">
                  تسجيل الدخول
                </button>
              </>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          أول حساب يُسجَّل لن يكون أدمن تلقائياً — راجع التعليمات في الأسفل بعد التسجيل.
        </p>
      </div>
    </div>
  );
}
