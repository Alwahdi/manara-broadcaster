"use client";

import { CheckCircle2, CircleAlert, Clock3, LoaderCircle, Send } from "lucide-react";
import { FormEvent, useState } from "react";
import type { PaymentRequestSummary } from "@/lib/types";

const labels = { pending: "قيد المراجعة", approved: "مقبول", rejected: "مرفوض" };

export function PaymentRequestForm({ initial }: { initial: PaymentRequestSummary[] }) {
  const [requests, setRequests] = useState(initial); const [pending, setPending] = useState(false); const [message, setMessage] = useState(""); const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const hasPending = requests.some((item) => item.status === "pending");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/payments/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(data.entries())) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "تعذر إرسال الطلب");
      setRequests(payload.requests); form.reset(); setMessageTone("success"); setMessage("تم إرسال طلبك. ستظهر النتيجة هنا بعد المراجعة.");
    } catch (error) { setMessageTone("error"); setMessage(error instanceof Error ? error.message : "تعذر إرسال الطلب"); }
    finally { setPending(false); }
  }
  return <section className="architecture-card payment-card" id="payment">
    <div className="ops-card-heading"><div><Send /><span><h2>تجديد الاشتراك</h2><p>أدخل بيانات الحوالة لإرسالها للمراجعة.</p></span></div></div>
    {requests.length ? <div className="payment-history">{requests.slice(0, 4).map((item) => <article key={item.id}><span className={`status-badge ${item.status === "approved" ? "active" : item.status === "rejected" ? "disabled" : "pending"}`}>{labels[item.status]}</span><strong>{item.requestedDays} يومًا</strong><small>المرجع: <bdi>{item.transferReference}</bdi> · {new Date(item.createdAt).toLocaleDateString("ar")}</small></article>)}</div> : null}
    {hasPending ? <div className="watch-notice"><Clock3 /><span>لديك طلب قيد المراجعة. لا حاجة لإرساله مرة أخرى.</span></div> : <form className="stack-form payment-form" onSubmit={submit}>
      <div className="form-pair"><label>المدة<select name="requestedDays" defaultValue="30"><option value="30">30 يومًا</option><option value="90">90 يومًا</option><option value="365">سنة</option></select></label><label>رقم الحوالة أو المرجع<input name="transferReference" dir="ltr" minLength={4} maxLength={120} required /></label></div>
      <div className="form-pair"><label>المبلغ (اختياري)<input name="amount" dir="ltr" type="number" min="0.01" step="0.01" /></label><label>العملة<select name="currency" defaultValue="USD"><option value="USD">USD</option><option value="SAR">SAR</option><option value="YER">YER</option></select></label></div>
      <label>ملاحظة (اختيارية)<textarea name="note" rows={3} maxLength={500} /></label>
      {message ? <p className={`form-message ${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>{messageTone === "error" ? <CircleAlert size={17} /> : <CheckCircle2 size={17} />}{message}</p> : null}
      <button className="button primary" type="submit" disabled={pending}>{pending ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}{pending ? "جارٍ الإرسال…" : "إرسال الطلب"}</button>
    </form>}
  </section>;
}
