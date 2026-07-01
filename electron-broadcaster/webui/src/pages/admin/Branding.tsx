import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { PageHeader } from "@/components/common";
import { useBrand } from "@/hooks/useBrand";

export function AdminBranding() {
  const { query } = useBrand();
  const qc = useQueryClient();
  const [brandName, setBrandName] = useState("");
  const [networkName, setNetworkName] = useState("");

  useEffect(() => {
    if (query.data) {
      setBrandName(String(query.data.brandName || ""));
      setNetworkName(String(query.data.networkName || ""));
    }
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => api.saveSettings({ brandName, networkName }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-state"] }),
  });

  return (
    <div style={{ maxWidth: 640 }}>
      <PageHeader title="الهوية" subtitle="اسم الشبكة والعلامة الظاهرة للمشاهدين" />
      <QueryBoundary query={query}>
        {() => (
          <div className="card card-pad">
            <div className="field">
              <label>اسم العلامة</label>
              <input className="input" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="اسم الشبكة الظاهر" />
              <span className="hint">يظهر في الترويسة وشاشات المشاهدين.</span>
            </div>
            <div className="field">
              <label>اسم الشبكة</label>
              <input className="input" value={networkName} onChange={(e) => setNetworkName(e.target.value)} />
            </div>
            <div className="row">
              <button className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "جارٍ الحفظ…" : "حفظ"}
              </button>
              {save.isSuccess ? <span className="badge badge-on badge-dot">تم الحفظ</span> : null}
              {save.isError ? <span className="badge badge-warn">{(save.error as Error).message}</span> : null}
            </div>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
