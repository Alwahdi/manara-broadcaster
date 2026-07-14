import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader, StatTile } from "@/components/common";
import { formatBytes, formatNumber } from "@/lib/format";

// Arabic labels for the numeric metrics returned by /api/admin/reports.
// Presenting raw English keys in an Arabic RTL interface is confusing, so every
// known metric is mapped to a clear Arabic label; unknown keys fall back to the
// raw key so new metrics still render instead of being dropped.
const REPORT_LABELS: Record<string, string> = {
  totalMedia: "إجمالي الوسائط",
  totalMovies: "الأفلام",
  totalEpisodes: "الحلقات",
  totalViewers: "المشاهدون",
  activeSessions: "الجلسات النشطة",
  totalRequests: "إجمالي الطلبات",
  sources: "مصادر التخزين",
  total: "الإجمالي",
  uniqueDevices: "الأجهزة الفريدة",
  activeIptvViewers: "مشاهدو IPTV الآن",
  peakIptvViewers: "أعلى مشاهدي IPTV",
  iptvUpstreamBytes: "سحب IPTV من الإنترنت",
  iptvDownstreamBytes: "إرسال IPTV للشبكة",
  iptvProviderRequests: "طلبات مزود IPTV",
  iptvErrors: "أخطاء IPTV",
  iptvCacheHits: "نجاحات كاش IPTV",
  iptvCacheMisses: "طلبات كاش جديدة",
  iptvCacheHitRate: "نسبة كاش IPTV",
  iptvAverageUpstreamTtfbMs: "متوسط استجابة مزود IPTV",
  iptvMaxUpstreamTtfbMs: "أعلى استجابة لمزود IPTV",
  iptvMaxSegmentFirstByteMs: "أعلى زمن لأول بيانات فيديو",
};

function reportValue(key: string, value: number) {
  if (key.toLowerCase().includes("bytes")) return formatBytes(value);
  if (key.toLowerCase().endsWith("ms")) return `${formatNumber(value)} ms`;
  if (key.toLowerCase().includes("rate")) return `${formatNumber(value)}%`;
  return formatNumber(value);
}

export function AdminReports() {
  const reports = useQuery({ queryKey: ["admin-reports"], queryFn: api.reports });
  return (
    <div>
      <PageHeader
        title="التقارير"
        subtitle="إحصاءات المشاهدة والاستخدام"
        actions={
          <a className="btn btn-ghost" href="/api/admin/reports/views.csv" download>
            تصدير CSV
          </a>
        }
      />
      <QueryBoundary
        query={reports}
        isEmpty={(d) => {
          const totals = (d.totals || d) as Record<string, unknown>;
          return !Object.values(totals).some((v) => typeof v === "number");
        }}
        empty={<EmptyState icon="📈" title="لا بيانات كافية" text="ستظهر التقارير بعد تجميع بيانات المشاهدة." />}
      >
        {(d) => {
          const totals = (d.totals || d) as Record<string, number>;
          const entries = Object.entries(totals).filter(([, v]) => typeof v === "number");
          return (
            <div className="grid grid-4">
              {entries.map(([key, value]) => (
                <StatTile key={key} value={reportValue(key, value)} label={REPORT_LABELS[key] || key} />
              ))}
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
