import { ArrowRight, DatabaseZap, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProviderCatalogManager } from "@/components/ProviderCatalogManager";
import { requireAdminPage } from "@/lib/auth";
import { listProviders } from "@/lib/db";

export default async function ProviderCatalogPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const provider = (await listProviders()).find((item) => item.id === id);
  if (!provider) notFound();
  return <>
    <header className="admin-page-heading provider-detail-heading"><div><Link className="back-link" href="/admin/providers"><ArrowRight size={16} />المزوّدون</Link><h1>مكتبة {provider.name}</h1><p>افحص الفهرس، ابحث، ثم اختر بالضبط ما سيُضاف إلى منصة WIVA.</p></div><div className="provider-heading-badges"><span className={`status-badge ${provider.status}`}>{provider.status === "active" ? "نشط" : "متوقف"}</span><span><DatabaseZap />{provider.kind === "licensed_xtream" ? "Xtream / Restream" : provider.kind === "licensed_hls" ? "M3U / HLS" : "VOD"}</span><span><ShieldCheck />حقوق مؤكدة</span></div></header>
    <ProviderCatalogManager provider={provider} />
  </>;
}
