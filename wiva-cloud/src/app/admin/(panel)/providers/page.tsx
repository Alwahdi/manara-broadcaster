import { ProviderManager } from "@/components/ProviderManager";
import { listProviders } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
export default async function ProvidersPage() { await requireAdminPage(); const providers = await listProviders(); return <><header className="admin-page-heading"><div><h1>المزوّدون</h1><p>إدارة بيانات الربط ومرجع حقوق التوزيع.</p></div></header><ProviderManager initial={providers} /></>; }
