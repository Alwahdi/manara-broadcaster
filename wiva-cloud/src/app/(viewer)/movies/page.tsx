import { CatalogPage } from "@/components/CatalogPage";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; category?: string; q?: string }> }) { return <CatalogPage kind="movie" title="الأفلام" description="مكتبة مرئية منظمة بتصنيفات وجودات متعددة وترجمة عند توفرها." searchParams={await searchParams} />; }
