"use client";

import { CheckCircle2, LoaderCircle, LogOut, MonitorSmartphone } from "lucide-react";
import { useState } from "react";
import type { ViewerSessionSummary } from "@/lib/types";

export function DeviceSessions({ initial }: { initial: ViewerSessionSummary[] }) {
  const [sessions, setSessions] = useState(initial); const [pending, setPending] = useState(""); const [message, setMessage] = useState("");
  async function remove(id: string) {
    setPending(id); setMessage("");
    try { const response = await fetch(`/api/viewer/sessions/${id}`, { method: "DELETE", credentials: "include" }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setSessions((items) => items.filter((item) => item.id !== id)); setMessage("تم تسجيل خروج الجهاز."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تسجيل خروج الجهاز"); } finally { setPending(""); }
  }
  async function removeOthers() {
    setPending("all"); setMessage("");
    try { const response = await fetch("/api/viewer/sessions", { method: "DELETE", credentials: "include" }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setSessions((items) => items.filter((item) => item.current)); setMessage(`تم تسجيل خروج ${payload.removed} جهاز.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تسجيل خروج الأجهزة"); } finally { setPending(""); }
  }
  return <section className="account-devices-card" id="devices"><div className="account-section-heading"><div><MonitorSmartphone /><span><h2>الأجهزة والجلسات</h2><p>راجع الأجهزة التي دخلت إلى حسابك.</p></span></div>{sessions.some((item) => !item.current) ? <button onClick={() => void removeOthers()} disabled={Boolean(pending)}>{pending === "all" ? <LoaderCircle className="spin" /> : <LogOut />}خروج البقية</button> : null}</div><div className="device-session-list">{sessions.map((session) => <article key={session.id}><span className="account-action-icon"><MonitorSmartphone /></span><div><strong>{session.device}</strong><small>{session.current ? "هذا الجهاز" : `آخر استخدام ${new Date(session.lastSeenAt).toLocaleDateString("ar")}`}</small></div>{session.current ? <span className="current-device"><CheckCircle2 /> حالي</span> : <button onClick={() => void remove(session.id)} disabled={Boolean(pending)}>{pending === session.id ? <LoaderCircle className="spin" /> : <LogOut />} خروج</button>}</article>)}</div>{message ? <p className="device-message" role="status">{message}</p> : null}</section>;
}
