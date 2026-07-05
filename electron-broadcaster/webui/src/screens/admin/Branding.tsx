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
  const [logo, setLogo] = useState("");

  useEffect(() => {
    if (query.data) {
      setBrandName(String(query.data.brandName || ""));
      setNetworkName(String(query.data.networkName || ""));
      setLogo(String(query.data.networkLogoDataUrl || query.data.settings?.networkLogoDataUrl || ""));
    }
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => api.saveSettings({ brandName, networkName, networkLogoDataUrl: logo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-state"] }),
  });
  const readLogo = (file?: File) => {
    if (!file) return;
    if (file.type !== "image/png") {
      window.alert("الرجاء اختيار صورة PNG فقط.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

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
            <div className="field">
              <label>شعار الشبكة PNG</label>
              <input className="input" type="file" accept="image/png" onChange={(e) => readLogo(e.target.files?.[0])} />
              {logo ? (
                <div className="brand-preview">
                  <img src={logo} alt="" />
                  <button className="btn btn-sm btn-ghost" type="button" onClick={() => setLogo("")}>
                    إزالة الشعار
                  </button>
                </div>
              ) : null}
              <span className="hint">يظهر الشعار في واجهة المشاهدة ولوحة الإدارة بعد الحفظ.</span>
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
