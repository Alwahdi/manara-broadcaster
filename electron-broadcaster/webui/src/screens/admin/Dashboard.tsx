import { useQuery } from "@tanstack/react-query";
import { Activity, CircleAlert, Database, MessageSquare, Radio, Users } from "lucide-react";
import { AppLink } from "@/components/AppLink";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { PageHeader, StatTile } from "@/components/common";
import { formatNumber } from "@/lib/format";

function formatBytes(value: number) {
  if (value < 1024) return `${formatNumber(value)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && size >= 1024; index += 1) {
    size /= 1024;
    unit = units[index];
  }
  return `${new Intl.NumberFormat("ar", { maximumFractionDigits: 1 }).format(size)} ${unit}`;
}

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
          const allChannels = [...(d.broadcast || []), ...(d.iptv || []), ...(d.cloudIptv || [])];
          const enabledChannels = allChannels.filter((channel) => channel.enabled !== false && channel.enabled !== 0).length;
          const media = d.media || [];
          const availableMedia = media.filter((item) => item.online !== false).length;
          const offlineMedia = media.length - availableMedia;
          const viewers = d.viewerAccounts || [];
          const onlineViewers = viewers.filter((viewer) => viewer.online).length;
          const sessions = d.sessions || [];
          const activeSince = Date.now() - 5 * 60_000;
          const activeSessions = sessions.filter((session) => Number(session.lastSeenAt || 0) >= activeSince).length;
          const totalRequests = sessions.reduce((sum, session) => sum + Number(session.requests || 0), 0);
          const transferredBytes = sessions.reduce((sum, session) => sum + Number(session.bytes || 0), 0);
          const messages = d.viewerMessages || [];
          const pendingMessages = messages.filter((message) => !["read", "done"].includes(String(message.status || ""))).length;
          return (
            <>
              <div className="dashboard-health" aria-label="ملخص التشغيل">
                <div><Activity /><span>حالة الخدمة</span><strong>تعمل</strong></div>
                <div><Radio /><span>القنوات المتاحة</span><strong>{formatNumber(enabledChannels)} / {formatNumber(allChannels.length)}</strong></div>
                <div><Users /><span>المشاهدون الآن</span><strong>{formatNumber(Math.max(onlineViewers, activeSessions))}</strong></div>
                <div><MessageSquare /><span>تحتاج متابعة</span><strong>{formatNumber(pendingMessages)}</strong></div>
              </div>
              <div className="grid grid-4 dashboard-stats">
                <StatTile value={formatNumber(viewers.length)} label="حساب مشاهد" />
                <StatTile value={formatNumber(activeSessions)} label="جلسة خلال 5 دقائق" />
                <StatTile value={formatNumber(totalRequests)} label="طلب عبر الشبكة" />
                <StatTile value={formatBytes(transferredBytes)} label="بيانات إلى المشاهدين" />
              </div>
              <div className="grid grid-2 dashboard-panels">
                <div className="card card-pad dashboard-panel">
                  <div className="dashboard-panel-heading"><Database /><div><h3>المكتبة</h3><p>توفر المحتوى المفهرس الآن</p></div></div>
                  <div className="dashboard-breakdown">
                    <div><span>متاح</span><strong>{formatNumber(availableMedia)}</strong></div>
                    <div className={offlineMedia ? "needs-attention" : ""}><span>غير متاح</span><strong>{formatNumber(offlineMedia)}</strong></div>
                  </div>
                  <AppLink href="/admin/library" className="btn btn-ghost btn-sm">إدارة المكتبة</AppLink>
                </div>
                <div className="card card-pad dashboard-panel">
                  <div className="dashboard-panel-heading"><CircleAlert /><div><h3>ما يحتاج انتباهك</h3><p>عناصر عملية قابلة للمتابعة</p></div></div>
                  <div className="dashboard-breakdown">
                    <div className={pendingMessages ? "needs-attention" : ""}><span>رسائل جديدة</span><strong>{formatNumber(pendingMessages)}</strong></div>
                    <div className={offlineMedia ? "needs-attention" : ""}><span>ملفات غير متاحة</span><strong>{formatNumber(offlineMedia)}</strong></div>
                  </div>
                  <div className="row"><AppLink href="/admin/messages" className="btn btn-ghost btn-sm">فتح الرسائل</AppLink><AppLink href="/admin/viewers" className="btn btn-ghost btn-sm">المشاهدون</AppLink></div>
                </div>
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
