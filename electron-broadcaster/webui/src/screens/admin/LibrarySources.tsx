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
  const [excludePickerFor, setExcludePickerFor] = useState<LibrarySource | null>(null);
  const [excludeInputs, setExcludeInputs] = useState<Record<string, string>>({});
  const [path, setPath] = useState("");
  const pathPlaceholder =
    typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("win")
      ? "D:\\Movies"
      : "/Users/name/Movies";
  const invalidateLibrary = () => {
    qc.invalidateQueries({ queryKey: ["library-sources"] });
    qc.invalidateQueries({ queryKey: ["admin-state"] });
    qc.invalidateQueries({ predicate: (query) => String(query.queryKey[0] || "").startsWith("library") });
  };

  const rescan = useMutation({
    mutationFn: (id: number | string) => api.librarySourceRescan(id),
    onSuccess: invalidateLibrary,
  });
  const relink = useMutation({
    mutationFn: ({ id, path }: { id: number | string; path: string }) =>
      api.librarySourceRelink(id, path),
    onSuccess: () => {
      setRelinkFor(null);
      invalidateLibrary();
    },
  });
  const add = useMutation({
    mutationFn: (nextPath: string) => api.addLibrarySource({ path: nextPath, kind: "movies" }),
    onSuccess: () => {
      setPath("");
      invalidateLibrary();
    },
  });
  const removeSource = useMutation({
    mutationFn: (id: number | string) => api.removeLibrarySource(id),
    onSuccess: invalidateLibrary,
  });
  const addExclude = useMutation({
    mutationFn: ({ id, excludePath }: { id: number | string; excludePath: string }) =>
      api.addLibrarySourceExclude(id, excludePath),
    onSuccess: (_data, variables) => {
      setExcludeInputs((prev) => ({ ...prev, [String(variables.id)]: "" }));
      setExcludePickerFor(null);
      invalidateLibrary();
    },
  });
  const removeExclude = useMutation({
    mutationFn: ({ id, excludePath }: { id: number | string; excludePath: string }) =>
      api.removeLibrarySourceExclude(id, excludePath),
    onSuccess: invalidateLibrary,
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

  if (excludePickerFor) {
    return (
      <div>
        <PageHeader
          title={`استثناء مجلد من: ${excludePickerFor.label || excludePickerFor.path}`}
          subtitle="اختر مجلداً لا تريد ظهوره أو فحصه داخل الاستراحة."
          actions={<button className="btn btn-ghost" onClick={() => setExcludePickerFor(null)}>إلغاء</button>}
        />
        <StorageBrowser
          selectLabel="استثناء هذا المجلد"
          onSelect={(picked) => addExclude.mutate({ id: excludePickerFor.id, excludePath: picked })}
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
                {(() => {
                  const sourceKey = String(s.id);
                  const excludes = (Array.isArray(s.excludePaths) ? s.excludePaths : Array.isArray(s.exclude_paths) ? s.exclude_paths : []) as string[];
                  return (
                    <>
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
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      const ok = window.confirm("سيتم حذف هذا المصدر وإخفاء محتواه من الاستراحة. هل تريد المتابعة؟");
                      if (ok) removeSource.mutate(s.id);
                    }}
                    disabled={removeSource.isPending || Number(s.locked || 0) === 1}
                  >
                    حذف المصدر
                  </button>
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                  <div className="row-between">
                    <div>
                      <div style={{ fontWeight: 800 }}>المسارات المستثناة</div>
                      <div className="hint">أي مجلد تضيفه هنا لن يتم فحصه ولن يظهر للمشاهدين.</div>
                    </div>
                    <button className="btn btn-sm btn-ghost" onClick={() => setExcludePickerFor(s)}>
                      اختيار مجلد
                    </button>
                  </div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <input
                      className="input mono"
                      dir="ltr"
                      value={excludeInputs[sourceKey] || ""}
                      onChange={(e) => setExcludeInputs((prev) => ({ ...prev, [sourceKey]: e.target.value }))}
                      placeholder={pathPlaceholder}
                      style={{ flex: 1, minWidth: 220 }}
                    />
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={addExclude.isPending || !(excludeInputs[sourceKey] || "").trim()}
                      onClick={() => addExclude.mutate({ id: s.id, excludePath: excludeInputs[sourceKey] || "" })}
                    >
                      استثناء
                    </button>
                  </div>
                  {excludes.length ? (
                    <div className="row" style={{ marginTop: 10 }}>
                      {excludes.map((excludePath) => (
                        <span key={excludePath} className="badge" style={{ maxWidth: "100%", gap: 8 }}>
                          <code className="mono truncate" dir="ltr" style={{ maxWidth: 260 }}>{excludePath}</code>
                          <button
                            className="btn btn-sm btn-ghost"
                            aria-label="حذف الاستثناء"
                            onClick={() => removeExclude.mutate({ id: s.id, excludePath })}
                            disabled={removeExclude.isPending}
                            style={{ minHeight: 28, padding: "0 8px" }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="hint" style={{ marginTop: 10 }}>لا توجد استثناءات لهذا المصدر.</p>
                  )}
                </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
