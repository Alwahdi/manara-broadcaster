import { CatalogPage } from "@/components/CatalogPage";
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; category?: string; q?: string }> }) { return <CatalogPage kind="series" title="المسلسلات" description="مسلسلات وحلقات منظمة مع حفظ المشاهدة على حسابك." searchParams={await searchParams} />; }
