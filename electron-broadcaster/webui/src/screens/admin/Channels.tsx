import { useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api, type Channel } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader } from "@/components/common";

export function AdminChannels() {
  const qc = useQueryClient();
  const state = useQuery({ queryKey: ["admin-state"], queryFn: api.adminState });
  const [editing, setEditing] = useState<Channel | null>(null);

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number | string; patch: Record<string, unknown> }) =>
      api.updateChannel(id, patch),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-state"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number | string) => api.deleteChannel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-state"] }),
  });
  const toggle = useMutation({
    mutationFn: (channel: Channel) =>
      api.updateChannel(channel.id, { enabled: !(channel.enabled !== false && channel.enabled !== 0) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-state"] }),
  });

  return (
    <div>
      <PageHeader
        title="القنوات"
        subtitle="إضافة وتعديل وحذف قنوات البث المباشر وأجهزة الالتقاط"
        actions={<AppLink href="/admin/channels/new" className="btn btn-primary">+ إضافة قناة</AppLink>}
      />
      {editing ? (
        <ChannelEditor
          channel={editing}
          busy={update.isPending}
          onCancel={() => setEditing(null)}
          onSave={(patch) => update.mutate({ id: editing.id, patch })}
        />
      ) : null}
      <QueryBoundary
        query={state}
        isEmpty={(d) => (d.broadcast?.length || 0) === 0}
        empty={
          <EmptyState
            icon="📺"
            title="لا توجد قنوات بعد"
            text="أضف قناة من جهاز التقاط عبر المعالج خطوة بخطوة."
            action={<AppLink href="/admin/channels/new" className="btn btn-primary">بدء المعالج</AppLink>}
          />
        }
      >
        {(d) => (
          <div className="card card-pad">
            <table className="table">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>المصدر</th>
                  <th>الصوت</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {(d.broadcast as Channel[]).map((ch) => {
                  const enabled = ch.enabled !== false && ch.enabled !== 0;
                  const source =
                    ch.source && typeof ch.source === "object"
                      ? (ch.source as Record<string, unknown>)
                      : {};
                  return (
                    <tr key={String(ch.id)}>
                      <td data-label="الاسم">{ch.name}</td>
                      <td data-label="المصدر" className="dim">{String(source.name || source.id || source.type || "بث")}</td>
                      <td data-label="الصوت" className="dim">{ch.audioDeviceName || ch.audioDeviceId || "بدون"}</td>
                      <td data-label="الحالة">
                        <span className={`badge badge-dot ${enabled ? "badge-on" : "badge-off"}`}>
                          {enabled ? "مفعّلة" : "متوقفة"}
                        </span>
                      </td>
                      <td data-label="الإجراءات">
                        <div className="row">
                          <button className="btn btn-sm btn-ghost" onClick={() => toggle.mutate(ch)} disabled={toggle.isPending}>
                            {enabled ? "إيقاف" : "تفعيل"}
                          </button>
                          <button className="btn btn-sm" onClick={() => setEditing(ch)}>تعديل</button>
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => {
                              if (window.confirm("حذف هذه القناة؟")) remove.mutate(ch.id);
                            }}
                            disabled={remove.isPending}
                          >
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}

function ChannelEditor({
  channel,
  busy,
  onCancel,
  onSave,
}: {
  channel: Channel;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const source = (channel.source || {}) as Record<string, unknown>;
  const [form, setForm] = useState({
    name: channel.name || "",
    description: channel.description || "",
    sourceName: String(source.name || ""),
    audioDeviceName: channel.audioDeviceName || "",
    resolution: channel.resolution || "1280x720",
    fps: String(channel.fps || 30),
    bitrateKbps: String(channel.bitrateKbps || 2500),
  });
  const set = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <div className="card card-pad" style={{ marginBottom: 18 }}>
      <h3 style={{ marginTop: 0 }}>تعديل القناة</h3>
      <div className="grid grid-2">
        <div className="field"><label>اسم القناة</label><input className="input" value={form.name} onChange={set("name")} /></div>
        <div className="field"><label>وصف مختصر</label><input className="input" value={form.description} onChange={set("description")} /></div>
        <div className="field"><label>اسم المصدر</label><input className="input" value={form.sourceName} onChange={set("sourceName")} /></div>
        <div className="field"><label>اسم جهاز الصوت</label><input className="input" value={form.audioDeviceName} onChange={set("audioDeviceName")} /></div>
        <div className="field"><label>الدقة</label><input className="input mono" dir="ltr" value={form.resolution} onChange={set("resolution")} /></div>
        <div className="field"><label>الإطارات</label><input className="input mono" dir="ltr" value={form.fps} onChange={set("fps")} /></div>
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button
          className="btn btn-primary"
          disabled={busy || !form.name.trim()}
          onClick={() => onSave({
            name: form.name,
            description: form.description,
            sourceName: form.sourceName,
            audioDeviceName: form.audioDeviceName,
            resolution: form.resolution,
            fps: Number(form.fps) || 30,
            bitrateKbps: Number(form.bitrateKbps) || 2500,
          })}
        >
          حفظ التعديل
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </div>
  );
}
