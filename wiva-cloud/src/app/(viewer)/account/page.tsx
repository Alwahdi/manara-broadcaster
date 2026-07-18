import Link from "next/link";
import { CalendarClock, ChevronLeft, FileText, KeyRound, LogOut, MonitorSmartphone, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { currentViewerAccount } from "@/lib/auth";
import { listPaymentRequests } from "@/lib/db";
import { PaymentRequestForm } from "@/components/PaymentRequestForm";
import { DeviceSessions } from "@/components/DeviceSessions";
import { currentViewerSessionHash } from "@/lib/auth";
import { listViewerSessions } from "@/lib/db";
import { PasswordChangeForm } from "@/components/PasswordChangeForm";

export const dynamic = "force-dynamic";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("");
}

export default async function AccountPage() {
  const viewer = await currentViewerAccount();
  if (!viewer) redirect("/login");
  const requests = await listPaymentRequests(viewer.id);
  const sessions = await listViewerSessions(viewer.id, await currentViewerSessionHash());
  const expired = viewer.status === "expired" || Boolean(viewer.expiresAt && new Date(viewer.expiresAt).getTime() <= Date.now());
  const expiry = viewer.expiresAt ? new Date(viewer.expiresAt).toLocaleDateString("ar") : "بدون تاريخ انتهاء";

  return (
    <div className="container account-page">
      <header className="app-page-heading"><span>الحساب</span><h1>إدارة حسابك</h1></header>
      <section className="account-profile-card">
        <div className="account-avatar" aria-hidden="true">{initials(viewer.name) || <UserRound />}</div>
        <div className="account-profile-copy">
          <span className={`account-status ${expired ? "expired" : "active"}`}><i />{expired ? "يحتاج إلى تجديد" : "الحساب نشط"}</span>
          <h2>{viewer.name}</h2>
          <p dir="ltr">{viewer.email}</p>
        </div>
        <div className="account-summary-grid">
          <div><MonitorSmartphone /><span><small>المشاهدة المتزامنة</small><strong>{viewer.maxConcurrentStreams} {viewer.maxConcurrentStreams === 1 ? "جهاز" : "أجهزة"}</strong></span></div>
          <div><CalendarClock /><span><small>الصلاحية</small><strong>{expiry}</strong></span></div>
        </div>
        <div className={`account-state-note ${expired ? "expired" : ""}`}><ShieldCheck /><span>{expired ? "المشاهدة متوقفة حتى اعتماد طلب التجديد." : "حسابك جاهز للمشاهدة على هذا الجهاز."}</span></div>
      </section>

      <section className="account-actions-card">
        <h2>الإجراءات</h2>
        <div className="account-action-list">
          <Link href="#payment"><span className="account-action-icon"><RefreshCw /></span><span><strong>تجديد الاشتراك</strong><small>إرسال رقم الحوالة للمراجعة</small></span><ChevronLeft /></Link>
          <Link href="#devices"><span className="account-action-icon"><MonitorSmartphone /></span><span><strong>الأجهزة</strong><small>{sessions.length.toLocaleString("ar")} جلسة مسجّلة · إدارة تسجيل الدخول</small></span><ChevronLeft /></Link>
          <Link href="#security"><span className="account-action-icon"><KeyRound /></span><span><strong>الأمان</strong><small>تغيير كلمة المرور وحماية الحساب</small></span><ChevronLeft /></Link>
          <form action="/api/auth/viewer/logout" method="post"><button type="submit"><span className="account-action-icon danger"><LogOut /></span><span><strong>تسجيل الخروج</strong><small>الخروج من الحساب على هذا الجهاز</small></span><ChevronLeft /></button></form>
        </div>
      </section>

      <DeviceSessions initial={sessions} />
      <PasswordChangeForm />

      <PaymentRequestForm initial={requests} />
      <nav className="account-legal-links" aria-label="المعلومات القانونية"><Link href="/privacy"><ShieldCheck /> الخصوصية</Link><Link href="/terms"><FileText /> الشروط</Link></nav>
    </div>
  );
}
