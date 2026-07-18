import { CatalogPage } from "@/components/CatalogPage";
export const revalidate = 20;
export default function Page() { return <CatalogPage kind="live" title="البث المباشر" description="اختر قناة وابدأ المشاهدة." />; }
