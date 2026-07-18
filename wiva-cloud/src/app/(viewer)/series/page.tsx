import { CatalogPage } from "@/components/CatalogPage";
export const revalidate = 20;
export default function Page() { return <CatalogPage kind="series" title="المسلسلات" description="اختر مسلسلًا ثم الموسم والحلقة." />; }
