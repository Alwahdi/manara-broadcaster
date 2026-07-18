import { ViewerManager } from "@/components/ViewerManager";
import { AdminPaymentRequests } from "@/components/AdminPaymentRequests";
import { listPaymentRequests, listViewers } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
export default async function ViewersPage() { await requireAdminPage(); const [viewers, payments] = await Promise.all([listViewers(), listPaymentRequests()]); return <><header className="admin-page-heading"><div><h1>المشاهدون</h1><p>الحسابات، الصلاحيات وطلبات التجديد.</p></div></header><AdminPaymentRequests initial={payments} /><ViewerManager initial={viewers} /></>; }
