import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api, type LibraryBrowseEntry } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader } from "@/components/common";

/** File-explorer style library view based on real source paths and relative paths. */
export function LibraryFolders() {
  const [sourceId, setSourceId] = useState<string>("");
  const [path, setPath] = useState<string>("");
  const params = useMemo(() => {
    const next: Record<string, string> = {};
    if (sourceId) next.sourceId = sourceId;
    if (path) next.path = path;
    return next;
  }, [sourceId, path]);
  const browse = useQuery({
    queryKey: ["library-browse", sourceId, path],
    queryFn: () => api.libraryBrowse(params),
  });

  const openRoot = () => {
    setSourceId("");
    setPath("");
  };
  const openSource = (id: string | number) => {
    setSourceId(String(id));
    setPath("");
  };
  const openFolder = (entry: LibraryBrowseEntry) => {
    if (!entry.sourceId) return;
    setSourceId(String(entry.sourceId));
    setPath(entry.path || "");
  };

  return (
    <div>
      <PageHeader
        title="المكتبة"
        subtitle="تصفّح المحتوى بنفس ترتيب المجلدات والملفات على جهاز السيرفر"
      />
      <QueryBoundary
        query={browse}
        isEmpty={(d) => !d.entries || d.entries.length === 0}
        empty={<EmptyState icon="📂" title="لا يوجد محتوى" text="أضف مسارًا من لوحة الإدارة ثم شغّل الفحص." />}
      >
        {(data) => (
          <section className="folder-browser" aria-label="تصفح المكتبة">
            <nav className="folder-breadcrumbs" aria-label="مسار المكتبة">
              <button type="button" onClick={openRoot}>المصادر</button>
              {data.source ? (
                <>
                  <span>/</span>
                  <button type="button" onClick={() => openSource(data.source!.id)}>
                    {data.source.name || data.source.label || "مصدر"}
                  </button>
                </>
              ) : null}
              {data.breadcrumbs.map((crumb) => (
                <span key={crumb.path} className="folder-crumb">
                  <span>/</span>
                  <button type="button" onClick={() => setPath(crumb.path)}>{crumb.name}</button>
                </span>
              ))}
            </nav>
            <div className="folder-grid">
              {data.entries.map((entry) =>
                entry.type === "folder" ? (
                  <FolderCard
                    key={`${entry.sourceId || "root"}-${entry.path || entry.name}`}
                    entry={entry}
                    onOpen={() => (sourceId ? openFolder(entry) : openSource(entry.sourceId || ""))}
                  />
                ) : (
                  <MediaFileCard key={`${entry.media?.id || entry.path}`} entry={entry} />
                ),
              )}
            </div>
          </section>
        )}
      </QueryBoundary>
    </div>
  );
}

function FolderCard({ entry, onOpen }: { entry: LibraryBrowseEntry; onOpen: () => void }) {
  return (
    <button type="button" className="folder-card" onClick={onOpen}>
      <div className="folder-card-art">
        {entry.cover ? <img src={entry.cover} alt="" loading="lazy" /> : <span aria-hidden>📁</span>}
        {!entry.online ? <span className="offline-ribbon">غير متصل</span> : null}
      </div>
      <div className="folder-card-body">
        <span className="folder-card-title">{entry.name}</span>
        <span className="folder-card-sub">{entry.count || 0} عنصر</span>
      </div>
    </button>
  );
}

function MediaFileCard({ entry }: { entry: LibraryBrowseEntry }) {
  const item = entry.media;
  const title = item?.title || item?.name || entry.name;
  const mediaId = item?.id ? String(item.id) : "";
  if (!mediaId) {
    return (
      <div className="folder-card folder-file-card" aria-disabled="true">
        <div className="folder-card-art">
          {entry.cover ? <img src={entry.cover} alt="" loading="lazy" /> : <span aria-hidden>🎬</span>}
          <span className="offline-ribbon">غير جاهز</span>
        </div>
        <div className="folder-card-body">
          <span className="folder-card-title">{title}</span>
          <span className="folder-card-sub">أعد فحص المكتبة من لوحة الإدارة</span>
        </div>
      </div>
    );
  }
  return (
    <AppLink
      href="/watch/media/$id"
      params={{ id: mediaId }}
      className="folder-card folder-file-card"
    >
      <div className="folder-card-art">
        {entry.cover ? <img src={entry.cover} alt="" loading="lazy" /> : <span aria-hidden>🎬</span>}
        {!entry.online ? <span className="offline-ribbon">غير متصل</span> : null}
      </div>
      <div className="folder-card-body">
        <span className="folder-card-title">{title}</span>
        <span className="folder-card-sub">{item?.kind || item?.category || "فيديو"}</span>
      </div>
    </AppLink>
  );
}
