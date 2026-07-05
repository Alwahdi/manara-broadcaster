import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader } from "@/components/common";
import { formatDateTime } from "@/lib/format";

export function AdminLogs() {
  const state = useQuery({ queryKey: ["admin-state"], queryFn: api.adminState });
  return (
    <div>
      <PageHeader title="السجلات" subtitle="سجل وصول الشبكة والأحداث" />
      <QueryBoundary
        query={state}
        isEmpty={(d) => (d.logs?.length || 0) === 0}
        empty={<EmptyState icon="📜" title="لا سجلات" text="لم تُسجّل أي أحداث بعد." />}
      >
        {(d) => (
          <div className="card card-pad">
            <table className="table">
              <thead>
                <tr>
                  <th>الوقت</th>
                  <th>الحدث</th>
                  <th>التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {(d.logs as Record<string, unknown>[]).map((log, i) => (
                  <tr key={i}>
                    <td data-label="الوقت" className="dim mono">{formatDateTime(log.at as string | number)}</td>
                    <td data-label="الحدث">{String(log.action || log.type || "—")}</td>
                    <td data-label="التفاصيل" className="dim truncate" style={{ maxWidth: 340 }}>
                      {String(log.targetName || log.detail || log.path || "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
