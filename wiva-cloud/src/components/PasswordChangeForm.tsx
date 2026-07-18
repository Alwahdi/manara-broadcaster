"use client";

import { CheckCircle2, CircleAlert, KeyRound, LoaderCircle } from "lucide-react";
import { FormEvent, useState } from "react";

export function PasswordChangeForm() {
  const [pending, setPending] = useState(false); const [message, setMessage] = useState(""); const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setPending(true); setMessage(""); setSuccess(false);
    try { const response = await fetch("/api/viewer/password", { method: "PATCH", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(Object.fromEntries(data.entries())) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); form.reset(); setSuccess(true); setMessage("تم تغيير كلمة المرور وتسجيل خروج الأجهزة الأخرى."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تغيير كلمة المرور"); } finally { setPending(false); }
  }
  return <section className="account-devices-card" id="security"><div className="account-section-heading"><div><KeyRound /><span><h2>الأمان</h2><p>غيّر كلمة المرور إذا شاركتها أو شككت في جهاز.</p></span></div></div><form className="password-change-form" onSubmit={submit}><label>كلمة المرور الحالية<input name="currentPassword" type="password" autoComplete="current-password" required /></label><label>كلمة المرور الجديدة<input name="newPassword" type="password" autoComplete="new-password" minLength={12} required /><small>12 حرفًا على الأقل</small></label>{message ? <p className={`form-message ${success ? "success" : "error"}`} role={success ? "status" : "alert"}>{success ? <CheckCircle2 /> : <CircleAlert />}{message}</p> : null}<button className="button primary" disabled={pending}>{pending ? <LoaderCircle className="spin" /> : <KeyRound />}{pending ? "جارٍ الحفظ…" : "تغيير كلمة المرور"}</button></form></section>;
}
