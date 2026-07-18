import { CatalogPage } from "@/components/CatalogPage";
export const revalidate = 20;
export default function Page() { return <CatalogPage kind="movie" title="الأفلام" description="مكتبة مرئية منظمة بتصنيفات وجودات متعددة وترجمة عند توفرها." />; }
