import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type StorageListing } from "@/lib/api";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { formatBytes } from "@/lib/format";

/**
 * In-app file browser for choosing a hard drive or folder.
 * Satisfies: "choosing the drive/folder happens from a file browser inside the UI"
 * and "adding a source is done from the UI, not by typing a manual id/path".
 */
export function StorageBrowser({
  onSelect,
  selectLabel = "اختيار هذا المجلد",
}: {
  onSelect: (path: string) => void;
  selectLabel?: string;
}) {
  const [path, setPath] = useState<string>("");

  const roots = useQuery({
    queryKey: ["storage-roots"],
    queryFn: api.storageRoots,
    staleTime: 30_000,
  });

  const listing = useQuery<StorageListing>({
    queryKey: ["storage-browse", path],
    queryFn: () => api.storageBrowse(path),
    enabled: path !== "",
  });

  const crumbs = path ? path.split(/[\\/]+/).filter(Boolean) : [];

  function goToCrumb(index: number) {
    const sep = path.includes("\\") ? "\\" : "/";
    const isWin = /^[A-Za-z]:/.test(path);
    const parts = path.split(/[\\/]+/).filter(Boolean).slice(0, index + 1);
    setPath(isWin ? parts.join(sep) + (parts.length === 1 ? sep : "") : sep + parts.join(sep));
  }

  return (
    <div className="explorer">
      <div className="card card-pad">
        <div className="side-group-label" style={{ paddingTop: 0 }}>الأقراص والمصادر</div>
        {roots.isLoading ? (
          <LoadingState label="قراءة الأقراص…" />
        ) : roots.isError ? (
          <ErrorState error={roots.error} onRetry={() => roots.refetch()} />
        ) : (
          <div className="explorer-list">
            {(roots.data?.roots || []).map((root) => (
              <div
                key={root.path}
                className={`explorer-item ${path.startsWith(root.path) ? "active" : ""}`}
                onClick={() => setPath(root.path)}
              >
                <span aria-hidden>{root.online === false ? "⚠️" : "💽"}</span>
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{root.label || root.path}</div>
                  <div className="tile-sub">
                    {root.online === false
                      ? "غير متصل"
                      : root.total
                        ? `${formatBytes(root.free)} متاحة`
                        : root.path}
                  </div>
                </div>
              </div>
            ))}
            {(roots.data?.roots || []).length === 0 ? (
              <EmptyState icon="💽" title="لا توجد أقراص" text="لم يتم العثور على أقراص أو مصادر تخزين." />
            ) : null}
          </div>
        )}
      </div>

      <div className="card card-pad">
        <div className="crumbs" style={{ marginBottom: 14 }}>
          <button onClick={() => setPath("")}>الأقراص</button>
          {crumbs.map((part, i) => (
            <span key={i}>
              <span className="dim"> / </span>
              <button onClick={() => goToCrumb(i)}>{part}</button>
            </span>
          ))}
        </div>

        {path === "" ? (
          <EmptyState icon="🗂️" title="اختر قرصًا للبدء" text="حدد قرصًا من القائمة لعرض مجلداته." />
        ) : listing.isLoading ? (
          <LoadingState label="قراءة المجلد…" />
        ) : listing.isError ? (
          <ErrorState error={listing.error} onRetry={() => listing.refetch()} />
        ) : (
          <>
            <div className="explorer-list" style={{ maxHeight: 340, overflowY: "auto" }}>
              {(listing.data?.entries || [])
                .filter((e) => e.type === "dir")
                .map((entry) => (
                  <div
                    key={entry.path}
                    className="explorer-item"
                    onClick={() => setPath(entry.path)}
                  >
                    <span aria-hidden>📁</span>
                    <span className="grow truncate">{entry.name}</span>
                  </div>
                ))}
              {(listing.data?.entries || []).filter((e) => e.type === "dir").length === 0 ? (
                <EmptyState icon="📂" title="لا مجلدات فرعية" text="هذا المجلد لا يحتوي على مجلدات فرعية." />
              ) : null}
            </div>
            <div className="row-between" style={{ marginTop: 16 }}>
              <code className="mono truncate" style={{ maxWidth: "60%" }}>{path}</code>
              <button className="btn btn-primary" onClick={() => onSelect(path)}>
                {selectLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
