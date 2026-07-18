import { MatchScheduleManager } from "@/components/MatchScheduleManager";
import { requireAdminPage } from "@/lib/auth";
import { listMatchSchedule } from "@/lib/db";

export default async function SchedulePage() {
  await requireAdminPage();
  const matches = await listMatchSchedule();
  return <>
    <header className="admin-page-heading"><div><h1>جدول المباريات</h1><p>أضف المواعيد والقنوات ليظهر جدول واضح للمشاهدين دون تشغيل عنصر وهمي.</p></div></header>
    <MatchScheduleManager initial={matches} />
  </>;
}
