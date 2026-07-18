"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function SignupForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
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
  return <form className="auth-form" onSubmit={submit}>
    <label>الاسم<input name="name" autoComplete="name" maxLength={120} required /></label>
    <label>البريد الإلكتروني<input name="email" type="email" dir="ltr" autoComplete="email" required /></label>
    <label>كلمة المرور<input name="password" type="password" dir="ltr" autoComplete="new-password" minLength={12} required /></label>
    {error ? <p className="form-error">{error}</p> : null}
    <button className="button primary wide" disabled={pending}>{pending ? <LoaderCircle className="spin" size={19} /> : <Sparkles size={19} />}{pending ? "جارٍ إنشاء حسابك…" : "ابدأ 3 أيام مجانًا"}</button>
  </form>;
}
