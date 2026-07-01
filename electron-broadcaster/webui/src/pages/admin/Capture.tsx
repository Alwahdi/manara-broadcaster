import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader } from "@/components/common";

export function AdminCapture() {
  const devices = useQuery({ queryKey: ["capture-devices"], queryFn: api.captureDevices });
  return (
    <div>
      <PageHeader
        title="أجهزة الالتقاط"
        subtitle="الشاشات والنوافذ وأجهزة الفيديو والصوت المتاحة للبث"
        actions={<Link to="/admin/channels/new" className="btn btn-primary">+ قناة من جهاز التقاط</Link>}
      />
      <QueryBoundary
        query={devices}
        isEmpty={(d) =>
          (d.screens.length + d.windows.length + d.videoDevices.length + d.audioDevices.length) === 0
        }
        empty={<EmptyState icon="🎥" title="لا أجهزة" text="لم يتم العثور على أي أجهزة التقاط متصلة." />}
      >
        {(d) => (
          <div className="grid grid-2">
            <DeviceGroup title="الشاشات" icon="🖥️" items={d.screens} />
            <DeviceGroup title="النوافذ" icon="🪟" items={d.windows} />
            <DeviceGroup title="أجهزة الفيديو" icon="🎥" items={d.videoDevices} />
            <DeviceGroup title="أجهزة الصوت" icon="🎙️" items={d.audioDevices} />
          </div>
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
  items: { id: string; name: string }[];
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
            <div key={it.id} className="row" style={{ padding: "6px 0" }}>
              <span aria-hidden>{icon}</span>
              <span className="truncate">{it.name}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
