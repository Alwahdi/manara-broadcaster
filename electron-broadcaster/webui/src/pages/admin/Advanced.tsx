import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { PageHeader } from "@/components/common";

export function AdminAdvanced() {
  const state = useQuery({ queryKey: ["agent-state"], queryFn: api.agentState });
  return (
    <div>
      <PageHeader title="متقدم" subtitle="أدوات ومعلومات للمستخدمين المتقدمين" />
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3>روابط مفيدة</h3>
        <div className="row">
          <a className="btn btn-ghost btn-sm" href="/api/agent/health" target="_blank" rel="noreferrer">فحص الصحة</a>
          <a className="btn btn-ghost btn-sm" href="/admin/legacy">الواجهة القديمة</a>
          <a className="btn btn-ghost btn-sm" href="/setup/welcome">إعادة الإعداد</a>
        </div>
      </div>
      <div className="card card-pad">
        <h3>حالة الوكيل (خام)</h3>
        <QueryBoundary query={state}>
          {(d) => (
            <pre className="mono" style={{ overflowX: "auto", color: "var(--text-muted)", fontSize: "0.8rem", maxHeight: 420 }}>
              {JSON.stringify(d, null, 2)}
            </pre>
          )}
        </QueryBoundary>
      </div>
    </div>
  );
}
