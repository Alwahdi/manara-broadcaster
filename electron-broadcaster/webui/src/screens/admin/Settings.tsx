import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { PageHeader } from "@/components/common";
import { useBrand } from "@/hooks/useBrand";

export function AdminSettings() {
  const { query } = useBrand();
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (query.data) {
      setForm({
        networkName: String(query.data.networkName || ""),
        country: String(query.data.country || ""),
        city: String(query.data.city || ""),
        timezone: String(query.data.timezone || ""),
      });
    }
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => api.saveSettings(form),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-state"] }),
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div style={{ maxWidth: 640 }}>
      <PageHeader title="الإعدادات" subtitle="إعدادات الشبكة العامة" />
      <QueryBoundary query={query}>
        {() => (
          <div className="card card-pad">
            <div className="field">
              <label>اسم الشبكة</label>
              <input className="input" value={form.networkName || ""} onChange={set("networkName")} />
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>الدولة</label>
                <input className="input" value={form.country || ""} onChange={set("country")} />
              </div>
              <div className="field">
                <label>المدينة</label>
                <input className="input" value={form.city || ""} onChange={set("city")} />
              </div>
            </div>
            <div className="field">
              <label>المنطقة الزمنية</label>
              <input className="input mono" dir="ltr" value={form.timezone || ""} onChange={set("timezone")} placeholder="Asia/Riyadh" />
            </div>
            <div className="row">
              <button className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
              </button>
              {save.isSuccess ? <span className="badge badge-on badge-dot">تم الحفظ</span> : null}
            </div>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
