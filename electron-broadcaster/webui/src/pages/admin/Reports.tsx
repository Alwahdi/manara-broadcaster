import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader, StatTile } from "@/components/common";
import { formatNumber } from "@/lib/format";

export function AdminReports() {
  const reports = useQuery({ queryKey: ["admin-reports"], queryFn: api.reports });
  return (
    <div>
      <PageHeader
        title="التقارير"
        subtitle="إحصاءات المشاهدة والاستخدام"
        actions={
          <a className="btn btn-ghost" href="/api/admin/reports/views.csv">تصدير CSV</a>
        }
      />
      <QueryBoundary
        query={reports}
        isEmpty={(d) => Object.keys(d || {}).length === 0}
        empty={<EmptyState icon="📈" title="لا بيانات كافية" text="ستظهر التقارير بعد تجميع بيانات المشاهدة." />}
      >
        {(d) => {
          const totals = (d.totals || d) as Record<string, number>;
          const entries = Object.entries(totals).filter(([, v]) => typeof v === "number");
          return (
            <div className="grid grid-4">
              {entries.map(([key, value]) => (
                <StatTile key={key} value={formatNumber(value)} label={key} />
              ))}
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
