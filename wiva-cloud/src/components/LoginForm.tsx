"use client";

import { Eye, EyeOff, LoaderCircle, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function LoginForm({ admin = false }: { admin?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const prefix = admin ? "admin" : "viewer";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const response = await fetch(admin ? "/api/auth/admin/login" : "/api/auth/viewer/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "تعذر تسجيل الدخول");
      router.replace(admin ? "/admin" : String(payload.destination || "/"));
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تسجيل الدخول");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="auth-form" method="post" onSubmit={submit} aria-busy={pending}>
      <label htmlFor={`${prefix}-email`}>البريد الإلكتروني<input id={`${prefix}-email`} name="email" type="email" dir="ltr" autoComplete="email" inputMode="email" placeholder="name@example.com" required autoFocus aria-invalid={Boolean(error)} /></label>
      <label htmlFor={`${prefix}-password`}>كلمة المرور
        <span className="password-input">
          <input id={`${prefix}-password`} name="password" type={showPassword ? "text" : "password"} dir="ltr" autoComplete="current-password" minLength={8} required aria-invalid={Boolean(error)} aria-describedby={error ? `${prefix}-login-error` : undefined} />
          <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} aria-pressed={showPassword}>
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
      </label>
      {error ? <p className="form-error" id={`${prefix}-login-error`} role="alert">{error}</p> : null}
      <button className="button primary wide" type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={19} /> : <LogIn size={19} />}
        {pending ? "جارٍ التحقق…" : admin ? "فتح لوحة الإدارة" : "الدخول إلى WIVA"}
      </button>
    </form>
  );
}
