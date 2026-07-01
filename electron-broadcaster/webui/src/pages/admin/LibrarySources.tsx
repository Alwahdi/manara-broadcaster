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
    mutationFn: (path: string) => api.storageValidate(path),
    onSuccess: () => {
      setAdding(false);
      qc.invalidateQueries({ queryKey: ["library-sources"] });
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

  if (adding) {
    return (
      <div>
        <PageHeader
          title="إضافة مصدر تخزين"
          subtitle="اختر القرص أو المجلد من متصفح الملفات"
          actions={<button className="btn btn-ghost" onClick={() => setAdding(false)}>إلغاء</button>}
        />
        <StorageBrowser selectLabel="استخدام هذا المجلد" onSelect={(path) => add.mutate(path)} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="مصادر التخزين"
        subtitle="الأقراص والمجلدات التي تُبنى منها المكتبة"
        actions={<button className="btn btn-primary" onClick={() => setAdding(true)}>+ إضافة مصدر</button>}
      />
      <QueryBoundary
        query={sources}
        isEmpty={(d) => (d.sources?.length || 0) === 0}
        empty={
          <EmptyState
            icon="💾"
            title="لا مصادر تخزين"
            text="أضف قرصًا أو مجلدًا ليبدأ بناء المكتبة."
            action={<button className="btn btn-primary" onClick={() => setAdding(true)}>اختيار من متصفح الملفات</button>}
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
