import { useQuery } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader } from "@/components/common";

export function AdminCapture() {
  const devices = useQuery({
    queryKey: ["capture-devices"],
    queryFn: api.captureDevices,
    staleTime: 0,
    refetchOnMount: "always",
  });
  return (
    <div className="admin-wide">
      <PageHeader
        title="أجهزة الالتقاط"
        subtitle="الشاشات والنوافذ وأجهزة الفيديو والصوت المتاحة للبث"
        actions={(
          <>
            <button type="button" className="btn btn-ghost" onClick={() => devices.refetch()} disabled={devices.isFetching}>
              {devices.isFetching ? "جاري التحديث…" : "تحديث الأجهزة"}
            </button>
            <AppLink href="/admin/channels/new" className="btn btn-primary">قناة من جهاز التقاط</AppLink>
          </>
        )}
      />
      <QueryBoundary
        query={devices}
        isEmpty={(d) =>
          (d.screens.length + d.windows.length + d.videoDevices.length + d.audioDevices.length) === 0
        }
        empty={(
          <EmptyState
            icon="USB"
            title="لم تظهر أجهزة الالتقاط بعد"
            text={devices.data?.message || "وصّل الجهاز، امنح WIVA صلاحية الكاميرا والصوت، ثم حدّث القائمة."}
            action={<button type="button" className="btn btn-primary" onClick={() => devices.refetch()}>إعادة البحث</button>}
          />
        )}
      >
        {(d) => (
          <>
            {d.message ? <div className="notice" style={{ marginBottom: 14 }}>{d.message}</div> : null}
            <div className="grid grid-2">
              <DeviceGroup title="الشاشات" icon="شاشة" items={d.screens} />
              <DeviceGroup title="النوافذ" icon="نافذة" items={d.windows} />
              <DeviceGroup title="أجهزة الفيديو" icon="فيديو" items={d.videoDevices} />
              <DeviceGroup title="أجهزة الصوت" icon="صوت" items={d.audioDevices} />
            </div>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}

function DeviceGroup({
  title,
  icon,
  items,
}: {
  title: string;
  icon: string;
  items: { id: string; name: string; thumbnail?: string }[];
}) {
  return (
    <div className="card card-pad">
      <h3>
        {icon} {title} <span className="badge">{items.length}</span>
      </h3>
      <div className="stack-sm" style={{ marginTop: 12 }}>
        {items.length === 0 ? (
          <span className="dim">لا يوجد</span>
        ) : (
          items.map((it) => (
            <div key={it.id} className="device-preview-row">
              {it.thumbnail ? (
                <img src={it.thumbnail} alt="" />
              ) : (
                <span aria-hidden>{icon}</span>
              )}
              <div>
                <strong className="truncate">{it.name}</strong>
                <small className="mono truncate" dir="ltr">{it.id}</small>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
