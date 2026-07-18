import { redirect } from "next/navigation";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { currentViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function AccountPage() {
  const viewer = await currentViewer(); if (!viewer) redirect("/login");
  return <div className="container"><header className="listing-hero"><span className="eyebrow"><i /> حساب نشط</span><h1>مرحبًا، {viewer.name}</h1><p>يمكنك المشاهدة بعدد {viewer.maxConcurrentStreams} بث متزامن وفق صلاحية حسابك.</p></header><section className="architecture-card"><div className="ops-card-heading"><div><UserRound /><span><h2>{viewer.email}</h2><p>حساب المشاهد</p></span></div></div><div className="watch-notice"><ShieldCheck /><span>جلسة الحساب محفوظة في Cookie آمنة ولا تحتوي بيانات المزوّد.</span></div><div className="account-actions"><div><strong>إنهاء الجلسة</strong><p>اخرج من حسابك بأمان على هذا الجهاز.</p></div><form action="/api/auth/viewer/logout" method="post"><button className="button danger" type="submit"><LogOut size={18} /> تسجيل الخروج</button></form></div></section></div>;
}
