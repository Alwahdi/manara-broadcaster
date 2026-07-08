import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api, type LibraryBrowseEntry } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { CategoryChips, ContentSection } from "@/components/common";

const LIBRARY_FILTERS = [
  { value: "all", label: "الكل" },
  { value: "folder", label: "مجلدات" },
  { value: "media", label: "ملفات" },
];

/** Folder-first subscriber library view. */
export function LibraryFolders() {
  const [sourceId, setSourceId] = useState<string>("");
  const [path, setPath] = useState<string>("");
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState("all");
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
    <div className="library-page">
      <section className="library-hero">
        <span className="badge">محتوى الشبكة</span>
        <h1>مكتبة الشبكة</h1>
        <p>تصفّح الأقسام والمجلدات المتاحة وشاهد المحتوى مباشرة من داخل الشبكة.</p>
      </section>
      <QueryBoundary
        query={browse}
        isEmpty={(d) => !d.entries || d.entries.length === 0}
        empty={<EmptyState icon="•" title="لا يوجد محتوى متاح حاليًا" text="ستظهر الأقسام هنا عند توفر محتوى جديد على الشبكة." />}
      >
        {(data) => {
          const q = term.trim().toLowerCase();
          const entries = data.entries.filter((entry) => {
            const matchesTerm = !q || `${entry.name} ${entry.path || ""} ${entry.media?.title || ""}`.toLowerCase().includes(q);
            const matchesFilter = filter === "all" || entry.type === filter;
            return matchesTerm && matchesFilter;
          });
          const folderCount = data.entries.filter((entry) => entry.type === "folder").length;
          const mediaCount = data.entries.filter((entry) => entry.type === "media").length;
          return (
            <section className="folder-browser" aria-label="تصفح المكتبة">
              <div className="viewer-filter-bar">
                <label className="search-shell">
                  <span>بحث</span>
                  <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="ابحث داخل هذا المجلد" />
                </label>
                <CategoryChips items={LIBRARY_FILTERS} value={filter} onChange={setFilter} />
              </div>
              <nav className="folder-breadcrumbs" aria-label="مسار المكتبة">
                <button type="button" onClick={openRoot}>المكتبة</button>
                {data.source ? (
                  <>
                    <span>/</span>
                    <button type="button" onClick={() => openSource(data.source!.id)}>
                      {data.source.name || data.source.label || "قسم"}
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
              <div className="library-stats">
                <div><strong>{folderCount}</strong><span>أقسام</span></div>
                <div><strong>{mediaCount}</strong><span>ملفات</span></div>
                <div><strong>{entries.length}</strong><span>نتائج</span></div>
              </div>
              <ContentSection title={data.source ? "محتوى القسم" : "أقسام المكتبة"} subtitle="تصفّح المحتوى المتاح داخل الشبكة">
                {entries.length ? (
                  <div className="folder-grid">
                    {entries.map((entry) =>
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
                ) : (
                  <EmptyState icon="•" title="لا توجد نتائج" text="جرّب إزالة البحث أو تغيير الفلتر." />
                )}
              </ContentSection>
            </section>
          );
        }}
      </QueryBoundary>
    </div>
  );
}

function FolderCard({ entry, onOpen }: { entry: LibraryBrowseEntry; onOpen: () => void }) {
  return (
    <button type="button" className="folder-card" onClick={onOpen}>
      <div className="folder-card-art">
        {entry.cover ? <img src={entry.cover} alt="" loading="lazy" /> : <span aria-hidden>ملف</span>}
        {!entry.online ? <span className="offline-ribbon">غير متاح حاليًا</span> : null}
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
          {entry.cover ? <img src={entry.cover} alt="" loading="lazy" /> : <span aria-hidden>فيديو</span>}
          <span className="offline-ribbon">غير جاهز</span>
        </div>
        <div className="folder-card-body">
          <span className="folder-card-title">{title}</span>
          <span className="folder-card-sub">هذا المحتوى غير جاهز للمشاهدة الآن</span>
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
        {entry.cover ? <img src={entry.cover} alt="" loading="lazy" /> : <span aria-hidden>فيديو</span>}
        {!entry.online ? <span className="offline-ribbon">غير متاح حاليًا</span> : null}
      </div>
      <div className="folder-card-body">
        <span className="folder-card-title">{title}</span>
        <span className="folder-card-sub">{item?.kind || item?.category || "فيديو"}</span>
      </div>
    </AppLink>
  );
}
