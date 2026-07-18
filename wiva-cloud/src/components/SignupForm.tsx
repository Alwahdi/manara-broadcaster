"use client";

import { Eye, EyeOff, LoaderCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function SignupForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/viewer/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form.entries())) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "تعذر إنشاء الحساب الآن");
      router.replace(String(payload.destination || "/")); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر إنشاء الحساب الآن"); }
    finally { setPending(false); }
  }
  return <form className="auth-form" onSubmit={submit} aria-busy={pending}>
    <label htmlFor="signup-name">الاسم<input id="signup-name" name="name" autoComplete="name" maxLength={120} placeholder="اسمك" required autoFocus /></label>
    <label htmlFor="signup-email">البريد الإلكتروني<input id="signup-email" name="email" type="email" dir="ltr" autoComplete="email" inputMode="email" placeholder="name@example.com" required aria-invalid={Boolean(error)} /></label>
    <label htmlFor="signup-password">كلمة المرور
      <span className="password-input">
        <input id="signup-password" name="password" type={showPassword ? "text" : "password"} dir="ltr" autoComplete="new-password" minLength={12} required aria-invalid={Boolean(error)} aria-describedby="signup-password-help" />
        <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} aria-pressed={showPassword}>
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
      <small className="field-help" id="signup-password-help">استخدم 12 حرفًا على الأقل لحماية حسابك.</small>
    </label>
    <label className="auth-consent"><input name="termsAccepted" type="checkbox" value="true" required /><span>أوافق على <Link href="/terms">شروط الاستخدام</Link> و<Link href="/privacy">سياسة الخصوصية</Link>.</span></label>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <button className="button primary wide" type="submit" disabled={pending}>{pending ? <LoaderCircle className="spin" size={19} /> : <Sparkles size={19} />}{pending ? "جارٍ إنشاء حسابك…" : "ابدأ 3 أيام مجانًا"}</button>
  </form>;
}
