import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type LibrarySource } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader } from "@/components/common";
import { StorageBrowser } from "@/components/StorageBrowser";
import { formatDateTime, formatNumber } from "@/lib/format";

export function AdminLibrarySources() {
  const qc = useQueryClient();
  const sources = useQuery({ queryKey: ["library-sources"], queryFn: api.librarySources });
  const [adding, setAdding] = useState(false);
  const [relinkFor, setRelinkFor] = useState<LibrarySource | null>(null);
  const [path, setPath] = useState("");
  const pathPlaceholder =
    typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("win")
      ? "D:\\Movies"
      : "/Users/name/Movies";

  const rescan = useMutation({
    mutationFn: (id: number | string) => api.librarySourceRescan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["library-sources"] }),
  });
  const relink = useMutation({
    mutationFn: ({ id, path }: { id: number | string; path: string }) =>
      api.librarySourceRelink(id, path),
    onSuccess: () => {
      setRelinkFor(null);
      qc.invalidateQueries({ queryKey: ["library-sources"] });
    },
  });
  const add = useMutation({
    mutationFn: (nextPath: string) => api.addLibrarySource({ path: nextPath, kind: "movies" }),
    onSuccess: async () => {
      setPath("");
      qc.invalidateQueries({ queryKey: ["library-sources"] });
      qc.invalidateQueries({ queryKey: ["admin-state"] });
    },
  });

  if (relinkFor) {
    return (
      <div>
        <PageHeader
          title={`إعادة ربط: ${relinkFor.label || relinkFor.path}`}
          subtitle="اختر الموقع الجديد للمصدر بعد إعادة توصيل القرص"
          actions={<button className="btn btn-ghost" onClick={() => setRelinkFor(null)}>إلغاء</button>}
        />
        <StorageBrowser
          selectLabel="إعادة الربط بهذا المجلد"
          onSelect={(path) => relink.mutate({ id: relinkFor.id, path })}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="مصادر التخزين"
        subtitle="أضف مسار قرص أو مجلد، وسيبدأ WIVA فحصه وبناء المكتبة مباشرة."
      />
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="field">
          <label>مسار المجلد أو القرص</label>
          <input
            className="input mono"
            dir="ltr"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder={pathPlaceholder}
          />
          <span className="hint">اكتب مسار المجلد كما يظهر في الجهاز الذي عليه WIVA Agent، أو اختره من المتصفح.</span>
        </div>
        <div className="row">
          <button className="btn btn-primary" onClick={() => add.mutate(path)} disabled={add.isPending || !path.trim()}>
            {add.isPending ? "جارٍ الإضافة والفحص…" : "إضافة وفحص"}
          </button>
          <button className="btn btn-ghost" onClick={() => setAdding((v) => !v)}>
            {adding ? "إخفاء المتصفح" : "اختيار من المتصفح"}
          </button>
          {add.isSuccess ? <span className="badge badge-on badge-dot">تمت الإضافة والفحص</span> : null}
          {add.isError ? <span className="badge badge-warn">{(add.error as Error).message}</span> : null}
        </div>
        {adding ? (
          <div style={{ marginTop: 18 }}>
            <StorageBrowser selectLabel="استخدام هذا المسار" onSelect={(picked) => setPath(picked)} />
          </div>
        ) : null}
      </div>
      <QueryBoundary
        query={sources}
        isEmpty={(d) => (d.sources?.length || 0) === 0}
        empty={
          <EmptyState
            icon="💾"
            title="لا مصادر تخزين"
            text="أضف مسار مجلد أو قرص من الأعلى ليبدأ بناء المكتبة."
          />
        }
      >
        {(d) => (
          <div className="grid grid-2">
            {(d.sources || []).map((s) => (
              <div key={s.id} className="card card-pad">
                <div className="row-between">
                  <div className="row">
                    <span style={{ fontSize: "1.6rem" }} aria-hidden>{s.online === false ? "⚠️" : "💽"}</span>
                    <div>
                      <div style={{ fontWeight: 700 }}>{s.label || s.path}</div>
                      <code className="mono tile-sub truncate" style={{ display: "block", maxWidth: 260 }}>{s.path}</code>
                    </div>
                  </div>
                  <span className={`badge badge-dot ${s.online === false ? "badge-warn" : "badge-on"}`}>
                    {s.online === false ? "غير متصل" : "متصل"}
                  </span>
                </div>
                <div className="row" style={{ marginTop: 12, color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  <span>{formatNumber(s.mediaCount)} عنصر</span>
                  <span>·</span>
                  <span>آخر فحص: {formatDateTime(s.lastScan)}</span>
                </div>
                {s.online === false ? (
                  <p className="hint" style={{ marginTop: 8 }}>
                    فصل القرص لا يحذف العناصر — تظهر كغير متصلة حتى إعادة التوصيل.
                  </p>
                ) : null}
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn-sm" onClick={() => rescan.mutate(s.id)} disabled={rescan.isPending || s.online === false}>
                    إعادة الفحص
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setRelinkFor(s)}>
                    إعادة الربط
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
