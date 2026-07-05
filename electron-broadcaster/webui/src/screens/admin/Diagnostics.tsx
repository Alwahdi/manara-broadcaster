import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { PageHeader } from "@/components/common";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { formatBytes, formatDuration, formatNumber } from "@/lib/format";

// Map raw OS identifiers to names operators recognise. The Agent runs mainly on
// Windows, so "win32" must read as "Windows" rather than an internal code.
const PLATFORM_NAMES: Record<string, string> = {
  win32: "Windows",
  darwin: "macOS",
  linux: "Linux",
};

// Arabic labels for the raw system fields returned by /api/admin/diagnostics.
const SYSTEM_LABELS: Record<string, string> = {
  platform: "نظام التشغيل",
  arch: "المعمارية",
  uptimeSec: "مدة التشغيل",
  memory: "استهلاك الذاكرة",
  liveClients: "المتصلون مباشرة",
  node: "إصدار Node",
};

// Format a single system value based on its key so bytes, durations, and counts
// are human-readable instead of raw numbers.
function formatSystemValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  switch (key) {
    case "platform":
      return PLATFORM_NAMES[String(value)] || String(value);
    case "uptimeSec":
      return formatDuration(Number(value));
    case "memory":
      return formatBytes(Number(value));
    case "liveClients":
      return formatNumber(Number(value));
    default:
      return String(value);
  }
}

const BACKEND_NAMES: Record<string, string> = {
  sqlite: "قاعدة بيانات SQLite",
  recovery: "SQLite (تمت الاستعادة من JSON)",
  "json-fallback": "تخزين احتياطي JSON",
  unknown: "غير معروف",
};

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
          const storage = d.storage;
          const system = (d.system || d.health || {}) as Record<string, unknown>;
          const systemEntries = Object.entries(system).filter(
            ([, v]) => v !== null && typeof v !== "object",
          );
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
              {storage && !storage.ok ? (
                <div className="card card-pad" style={{ marginTop: 20 }}>
                  <div className="row-between">
                    <h3>تخزين البيانات المحلية</h3>
                    <span className="badge badge-dot badge-off">
                      {BACKEND_NAMES[String(storage.backend)] || storage.backend}
                    </span>
                  </div>
                  <p className="muted">
                    يعمل التطبيق حاليًا على التخزين الاحتياطي بدلًا من قاعدة البيانات المدمجة. قد لا تكون هذه وضعية إنتاج موصى بها.
                  </p>
                  {storage.loadError ? (
                    <p className="dim mono">سبب التحميل: {storage.loadError}</p>
                  ) : null}
                  {storage.initError ? (
                    <p className="dim mono">سبب التهيئة: {storage.initError}</p>
                  ) : null}
                  {storage.recoveryAction ? (
                    <p><strong>إجراء الاستعادة:</strong> {storage.recoveryAction}</p>
                  ) : null}
                </div>
              ) : null}
              {storage && storage.migratedFromFallback ? (
                <div className="card card-pad" style={{ marginTop: 20 }}>
                  <div className="row-between">
                    <h3>تخزين البيانات المحلية</h3>
                    <span className="badge badge-dot badge-on">
                      {BACKEND_NAMES[String(storage.backend)] || storage.backend}
                    </span>
                  </div>
                  <p className="muted">تمت استعادة بيانات المكتبة من التخزين الاحتياطي إلى قاعدة بيانات SQLite بنجاح.</p>
                </div>
              ) : null}
              <div className="card card-pad" style={{ marginTop: 20 }}>
                <h3>معلومات النظام</h3>
                {systemEntries.length ? (
                  <table className="table">
                    <tbody>
                      {systemEntries.map(([key, value]) => (
                        <tr key={key}>
                          <td>{SYSTEM_LABELS[key] || key}</td>
                          <td className="dim mono">{formatSystemValue(key, value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="muted">لا تتوفر معلومات النظام حاليًا.</p>
                )}
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
