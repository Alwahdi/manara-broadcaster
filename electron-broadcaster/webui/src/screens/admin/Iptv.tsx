import { useEffect, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api, type Channel } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader } from "@/components/common";

export function AdminIptv() {
  const qc = useQueryClient();
  const state = useQuery({ queryKey: ["admin-state"], queryFn: api.adminState });
  const [editing, setEditing] = useState<Channel | null>(null);
  const [policy, setPolicy] = useState({ cloudIptvRefreshMinutes: "3", iptvGlobalLimitBytes: "0" });

  useEffect(() => {
    if (!state.data?.iptvPolicy) return;
    setPolicy({
      cloudIptvRefreshMinutes: String(state.data.iptvPolicy.cloudIptvRefreshMinutes || 3),
      iptvGlobalLimitBytes: String(state.data.iptvPolicy.iptvGlobalLimitBytes || 0),
    });
  }, [state.data?.iptvPolicy?.cloudIptvRefreshMinutes, state.data?.iptvPolicy?.iptvGlobalLimitBytes]);

  const toggle = useMutation({
    mutationFn: (id: number | string) => api.toggleIptv(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-state"] }),
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number | string; patch: Record<string, unknown> }) =>
      api.updateIptv(id, patch),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-state"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number | string) => api.deleteIptv(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-state"] }),
  });
  const savePolicy = useMutation({
    mutationFn: () => api.updateIptvPolicy({
      cloudIptvRefreshMinutes: Number(policy.cloudIptvRefreshMinutes) || 3,
      iptvGlobalLimitBytes: Number(policy.iptvGlobalLimitBytes) || 0,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-state"] }),
  });

  return (
    <div>
      <PageHeader
        title="قنوات IPTV"
        subtitle="تحكم كامل بالقنوات المحلية، وتفعيل/إيقاف للقنوات السحابية"
        actions={<AppLink href="/admin/iptv/import" className="btn btn-primary">استيراد قائمة</AppLink>}
      />
      {editing ? (
        <IptvEditor
          channel={editing}
          busy={update.isPending}
          onCancel={() => setEditing(null)}
          onSave={(patch) => update.mutate({ id: editing.id, patch })}
        />
      ) : null}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>تحديث القنوات السحابية</h3>
        <div className="grid grid-2">
          <div className="field">
            <label>كل كم دقيقة يتم التحديث من السحابة؟</label>
            <input
              className="input mono"
              dir="ltr"
              inputMode="numeric"
              value={policy.cloudIptvRefreshMinutes}
              onChange={(e) => setPolicy((prev) => ({ ...prev, cloudIptvRefreshMinutes: e.target.value }))}
            />
            <span className="hint">الحد الأدنى دقيقة واحدة، والقيمة الافتراضية 3 دقائق.</span>
          </div>
          <div className="field">
            <label>حد النقل العام بالبايت</label>
            <input
              className="input mono"
              dir="ltr"
              inputMode="numeric"
              value={policy.iptvGlobalLimitBytes}
              onChange={(e) => setPolicy((prev) => ({ ...prev, iptvGlobalLimitBytes: e.target.value }))}
            />
          </div>
        </div>
        <div className="row">
          <button className="btn btn-primary" onClick={() => savePolicy.mutate()} disabled={savePolicy.isPending}>
            {savePolicy.isPending ? "جارٍ الحفظ…" : "حفظ سياسة IPTV"}
          </button>
          {savePolicy.isSuccess ? <span className="badge badge-on badge-dot">تم الحفظ</span> : null}
          {savePolicy.isError ? <span className="badge badge-warn">{(savePolicy.error as Error).message}</span> : null}
        </div>
      </div>
      <QueryBoundary
        query={state}
        isEmpty={(d) => (d.iptv?.length || 0) + (d.cloudIptv?.length || 0) === 0}
        empty={
          <EmptyState
            icon="🛰️"
            title="لا قنوات IPTV"
            text="استورد قائمة M3U أو أضف قناة يدويًا."
            action={<AppLink href="/admin/iptv/import" className="btn btn-primary">استيراد M3U</AppLink>}
          />
        }
      >
        {(d) => {
          const all: Channel[] = [...(d.cloudIptv || []), ...(d.iptv || [])];
          return (
            <div className="card card-pad">
              <table className="table">
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>النوع</th>
                    <th>المجموعة</th>
                    <th>الحالة</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((ch) => (
                    <IptvRow
                      key={String(ch.id)}
                      channel={ch}
                      onToggle={(id) => toggle.mutate(id)}
                      onEdit={setEditing}
                      onDelete={(id) => {
                        if (window.confirm("حذف هذه القناة؟")) remove.mutate(id);
                      }}
                      busy={toggle.isPending || remove.isPending}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}

function IptvRow({
  channel,
  onToggle,
  onEdit,
  onDelete,
  busy,
}: {
  channel: Channel;
  onToggle: (id: number | string) => void;
  onEdit: (channel: Channel) => void;
  onDelete: (id: number | string) => void;
  busy: boolean;
}) {
  const enabled = channel.enabled !== false && channel.enabled !== 0;
  const isCloud = String(channel.id).startsWith("cloud-") || channel.source === "cloud";
  return (
    <tr>
      <td>{channel.name}</td>
      <td className="dim">{isCloud ? "سحابي" : "محلي"}</td>
      <td className="dim">{channel.group || channel.category || "—"}</td>
      <td>
        <span className={`badge badge-dot ${enabled ? "badge-on" : "badge-off"}`}>
          {enabled ? "مفعّلة" : "متوقفة"}
        </span>
      </td>
      <td>
        <div className="row">
          <button className="btn btn-sm btn-ghost" onClick={() => onToggle(channel.id)} disabled={busy}>
            {enabled ? "إيقاف" : "تفعيل"}
          </button>
          {!isCloud ? <button className="btn btn-sm" onClick={() => onEdit(channel)}>تعديل</button> : null}
          {!isCloud ? (
            <button className="btn btn-sm btn-ghost" onClick={() => onDelete(channel.id)} disabled={busy}>
              حذف
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function IptvEditor({
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
  const [form, setForm] = useState({
    name: channel.name || "",
    url: channel.url || "",
    category: channel.category || "",
    logo: channel.logo || "",
    transferLimitBytes: String(channel.transferLimitBytes || 0),
  });
  const set = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <div className="card card-pad" style={{ marginBottom: 18 }}>
      <h3 style={{ marginTop: 0 }}>تعديل قناة IPTV</h3>
      <div className="grid grid-2">
        <div className="field"><label>اسم القناة</label><input className="input" value={form.name} onChange={set("name")} /></div>
        <div className="field"><label>التصنيف</label><input className="input" value={form.category} onChange={set("category")} /></div>
        <div className="field"><label>الرابط</label><input className="input mono" dir="ltr" value={form.url} onChange={set("url")} /></div>
        <div className="field"><label>الشعار</label><input className="input mono" dir="ltr" value={form.logo} onChange={set("logo")} /></div>
        <div className="field"><label>حد النقل بالبايت</label><input className="input mono" dir="ltr" value={form.transferLimitBytes} onChange={set("transferLimitBytes")} /></div>
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button
          className="btn btn-primary"
          disabled={busy || !form.name.trim() || !form.url.trim()}
          onClick={() => onSave({
            name: form.name,
            url: form.url,
            category: form.category,
            logo: form.logo,
            transferLimitBytes: Number(form.transferLimitBytes) || 0,
          })}
        >
          حفظ التعديل
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </div>
  );
}
