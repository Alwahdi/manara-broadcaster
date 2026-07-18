import { ViewerManager } from "@/components/ViewerManager";
import { listViewers } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
export default async function ViewersPage() { await requireAdminPage(); const viewers = await listViewers(); return <><header className="admin-page-heading"><div><h1>المشاهدون</h1><p>الحسابات، الصلاحيات وحدود المشاهدة.</p></div></header><ViewerManager initial={viewers} /></>; }
