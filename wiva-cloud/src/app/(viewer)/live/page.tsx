import { CatalogPage } from "@/components/CatalogPage";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; category?: string; q?: string }> }) { return <CatalogPage kind="live" title="البث المباشر" description="اختر قناتك واستمتع بمشاهدة سريعة وسلسة على كل أجهزتك." searchParams={await searchParams} />; }
