import { ChannelManager } from "@/components/ChannelManager";
import { listAssets, listProviders } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
export default async function ChannelsPage() { await requireAdminPage(); const [assets, providers] = await Promise.all([listAssets(undefined, true), listProviders()]); return <><header className="admin-page-heading"><div><h1>المحتوى</h1><p>فعّل القنوات والأفلام التي تسمح بها عقود المزوّد.</p></div></header><ChannelManager initial={assets} providers={providers} /></>; }
