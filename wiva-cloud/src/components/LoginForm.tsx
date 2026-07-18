"use client";

import { LoaderCircle, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function LoginForm({ admin = false }: { admin?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

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
    <form className="auth-form" method="post" onSubmit={submit}>
      <label>البريد الإلكتروني<input name="email" type="email" dir="ltr" autoComplete="email" required /></label>
      <label>كلمة المرور<input name="password" type="password" dir="ltr" autoComplete={admin ? "current-password" : "current-password"} minLength={8} required /></label>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="button primary wide" disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={19} /> : <LogIn size={19} />}
        {pending ? "جارٍ التحقق…" : admin ? "فتح لوحة الإدارة" : "الدخول إلى WIVA"}
      </button>
    </form>
  );
}
