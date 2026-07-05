import { useQuery } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { PageHeader, StatTile } from "@/components/common";
import { formatNumber } from "@/lib/format";

export function AdminDashboard() {
  const state = useQuery({ queryKey: ["admin-state"], queryFn: api.adminState });

  return (
    <div>
      <PageHeader
        title="لوحة المعلومات"
        subtitle="نظرة سريعة على حالة الشبكة والمحتوى"
        actions={
          <>
            <AppLink href="/admin/channels/new" className="btn btn-primary">+ قناة جديدة</AppLink>
            <AppLink href="/admin/library/sources" className="btn btn-ghost">مصادر التخزين</AppLink>
          </>
        }
      />
      <QueryBoundary query={state}>
        {(d) => {
          const broadcast = d.broadcast?.length || 0;
          const iptv = (d.iptv?.length || 0) + (d.cloudIptv?.length || 0);
          const media = d.media?.length || 0;
          const viewers = d.viewerAccounts?.length || 0;
          const sessions = d.sessions?.length || 0;
          const messages = d.viewerMessages?.length || 0;
          return (
            <>
              <div className="grid grid-4">
                <StatTile value={formatNumber(broadcast)} label="قنوات البث" />
                <StatTile value={formatNumber(iptv)} label="قنوات IPTV" />
                <StatTile value={formatNumber(media)} label="عناصر المكتبة" />
                <StatTile value={formatNumber(viewers)} label="المشاهدون" />
              </div>
              <div className="grid grid-2" style={{ marginTop: 20 }}>
                <div className="card card-pad">
                  <h3>الجلسات النشطة</h3>
                  <div className="stat-value mono" style={{ marginTop: 10 }}>{formatNumber(sessions)}</div>
                  <p className="muted">عدد الأجهزة المتصلة حاليًا بالشبكة.</p>
                  <AppLink href="/admin/viewers" className="btn btn-ghost btn-sm">عرض المشاهدين</AppLink>
                </div>
                <div className="card card-pad">
                  <h3>الرسائل الواردة</h3>
                  <div className="stat-value mono" style={{ marginTop: 10 }}>{formatNumber(messages)}</div>
                  <p className="muted">رسائل من المشاهدين بانتظار المراجعة.</p>
                  <AppLink href="/admin/messages" className="btn btn-ghost btn-sm">فتح الرسائل</AppLink>
                </div>
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
