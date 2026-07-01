import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { PageHeader } from "@/components/common";
import { useLiveStatus } from "@/hooks/useLiveStatus";

export function AdminDiagnostics() {
  const diag = useQuery({ queryKey: ["admin-diagnostics"], queryFn: api.diagnostics, refetchInterval: 10_000 });
  const { status } = useLiveStatus();

  return (
    <div>
      <PageHeader
        title="التشخيص"
        subtitle="حالة الخدمات والاتصال المباشر"
        actions={<span className={`badge badge-dot ${status === "online" ? "badge-on" : status === "offline" ? "badge-off" : "badge-warn"}`}>البث المباشر: {status === "online" ? "متصل" : status === "offline" ? "منقطع" : "يتصل"}</span>}
      />
      <QueryBoundary query={diag}>
        {(d) => {
          const services = d.services || [];
          return (
            <>
              <div className="grid grid-2">
                {services.map((s) => (
                  <div key={s.name} className="card card-pad row-between">
                    <div>
                      <strong>{s.name}</strong>
                      {s.detail ? <div className="tile-sub">{s.detail}</div> : null}
                    </div>
                    <span className={`badge badge-dot ${s.ok ? "badge-on" : "badge-off"}`}>
                      {s.ok ? "يعمل" : "متوقف"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="card card-pad" style={{ marginTop: 20 }}>
                <h3>معلومات النظام</h3>
                <pre className="mono" style={{ overflowX: "auto", color: "var(--text-muted)", fontSize: "0.82rem" }}>
                  {JSON.stringify(d.system || d.health || {}, null, 2)}
                </pre>
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
