"use client";

import { Check, Clock3, LoaderCircle, ReceiptText, X } from "lucide-react";
import { useState } from "react";
import type { PaymentRequestSummary } from "@/lib/types";

export function AdminPaymentRequests({ initial }: { initial: PaymentRequestSummary[] }) {
  const [requests, setRequests] = useState(initial); const [pendingId, setPendingId] = useState(""); const [message, setMessage] = useState("");
  async function review(id: string, status: "approved" | "rejected") {
    setPendingId(id); setMessage("");
    try {
      const response = await fetch(`/api/admin/payments/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "تعذرت مراجعة الطلب");
      setRequests(payload.requests); setMessage(status === "approved" ? "تم اعتماد الطلب وتمديد الحساب." : "تم رفض الطلب.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذرت مراجعة الطلب"); }
    finally { setPendingId(""); }
  }
  const pending = requests.filter((item) => item.status === "pending");
  return <section className="ops-card admin-payment-card"><div className="ops-card-heading"><div><ReceiptText /><span><h2>طلبات التجديد</h2><p>راجع مرجع الحوالة ثم اعتمد المدة أو ارفض الطلب.</p></span></div><span className="count-badge">{pending.length}</span></div>
    {message ? <p className="form-message">{message}</p> : null}
    <div className="payment-admin-list">{pending.map((item) => <article key={item.id}><div><strong>{item.viewerName}</strong><span dir="ltr">{item.viewerEmail}</span><small><bdi>{item.transferReference}</bdi> · {item.requestedDays} يومًا{item.amount ? ` · ${item.amount} ${item.currency}` : ""}</small>{item.note ? <p>{item.note}</p> : null}</div><div className="payment-review-actions"><button className="icon-button approve" aria-label="اعتماد الطلب" disabled={Boolean(pendingId)} onClick={() => review(item.id, "approved")}>{pendingId === item.id ? <LoaderCircle className="spin" /> : <Check />}</button><button className="icon-button" aria-label="رفض الطلب" disabled={Boolean(pendingId)} onClick={() => review(item.id, "rejected")}><X /></button></div></article>)}{!pending.length ? <div className="inline-empty"><Clock3 /><p>لا توجد طلبات تجديد بانتظار المراجعة.</p></div> : null}</div>
  </section>;
}
