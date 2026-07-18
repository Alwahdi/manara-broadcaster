import { redirect } from "next/navigation";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { currentViewerAccount } from "@/lib/auth";
import { listPaymentRequests } from "@/lib/db";
import { PaymentRequestForm } from "@/components/PaymentRequestForm";

export const dynamic = "force-dynamic";
export default async function AccountPage() {
  const viewer = await currentViewerAccount(); if (!viewer) redirect("/login");
  const requests = await listPaymentRequests(viewer.id); const expired = viewer.status === "expired" || Boolean(viewer.expiresAt && new Date(viewer.expiresAt).getTime() <= Date.now());
  return <div className="container"><header className="listing-hero"><span className="eyebrow"><i /> {expired ? "التجربة منتهية" : "حساب نشط"}</span><h1>مرحبًا، {viewer.name}</h1><p>{expired ? "جدّد اشتراكك للعودة إلى المشاهدة." : `يمكنك المشاهدة على ${viewer.maxConcurrentStreams} جهاز في الوقت نفسه.`}</p></header><section className="architecture-card"><div className="ops-card-heading"><div><UserRound /><span><h2>{viewer.email}</h2><p>{viewer.expiresAt ? `متاح حتى ${new Date(viewer.expiresAt).toLocaleDateString("ar")}` : "حساب بلا تاريخ انتهاء"}</p></span></div></div><div className="watch-notice"><ShieldCheck /><span>{expired ? "المشاهدة متوقفة مؤقتًا حتى اعتماد طلب التجديد." : "حسابك جاهز والمشاهدة محمية على هذا الجهاز."}</span></div><div className="account-actions"><div><strong>تسجيل الخروج</strong><p>اخرج من حسابك على هذا الجهاز.</p></div><form action="/api/auth/viewer/logout" method="post"><button className="button danger" type="submit"><LogOut size={18} /> تسجيل الخروج</button></form></div></section><PaymentRequestForm initial={requests} /></div>;
}
