import { useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api, type LibraryBrowseEntry } from "@/lib/api";
import { QueryBoundary, EmptyState, ViewerSkeleton } from "@/components/States";
import { CategoryChips, ContentSection } from "@/components/common";
import { useLiveStatus } from "@/hooks/useLiveStatus";

const LIBRARY_FILTERS = [
  { value: "all", label: "الكل" },
  { value: "folder", label: "مجلدات" },
  { value: "media", label: "ملفات" },
];

/** Folder-first subscriber library view. */
export function LibraryFolders() {
  const queryClient = useQueryClient();
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
    placeholderData: keepPreviousData,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useLiveStatus({
    onEvent: (event) => {
      if (event.type !== "library") return;
      queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0] || "").startsWith("library") });
    },
  });

  const prefetchFolder = (entry: LibraryBrowseEntry) => {
    if (!entry.sourceId) return;
    const nextSource = String(entry.sourceId);
    const nextPath = entry.path || "";
    queryClient.prefetchQuery({
      queryKey: ["library-browse", nextSource, nextPath],
      queryFn: () => api.libraryBrowse({ sourceId: nextSource, ...(nextPath ? { path: nextPath } : {}) }),
      staleTime: 5 * 60_000,
      gcTime: 20 * 60_000,
    });
  };

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
        <h1>الاستراحة</h1>
        <p>تصفّح الأقسام والمجلدات المتاحة وشاهد المحتوى مباشرة من داخل الشبكة.</p>
        <div className="library-hero-orbits" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </section>
      <QueryBoundary
        query={browse}
        isEmpty={(d) => !d.entries || d.entries.length === 0}
        empty={<EmptyState icon="W" title="لا يوجد محتوى متاح حاليًا" text="ستظهر الأقسام هنا عند توفر محتوى جديد على الشبكة." />}
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
          const singleSourceMode = (data.sources?.length || 0) === 1;
          return (
            <section className="folder-browser" aria-label="تصفح الاستراحة">
              {browse.isFetching && !browse.isLoading ? <div className="folder-refresh-line" aria-hidden /> : null}
              <div className="viewer-filter-bar">
                <label className="search-shell">
                  <span>بحث</span>
                  <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="ابحث داخل هذا المجلد" />
                </label>
                <CategoryChips items={LIBRARY_FILTERS} value={filter} onChange={setFilter} />
              </div>
              <nav className="folder-breadcrumbs" aria-label="تنقل الاستراحة">
                <button type="button" onClick={openRoot}>الاستراحة</button>
                {data.source && !singleSourceMode ? (
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
              <ContentSection title={data.source ? "محتوى القسم" : "أقسام الاستراحة"} subtitle="تصفّح المحتوى المتاح داخل الشبكة">
                {entries.length ? (
                  <div className="folder-grid">
                    {entries.map((entry) =>
                      entry.type === "folder" ? (
                        <FolderCard
                          key={`${entry.sourceId || "root"}-${entry.path || entry.name}`}
                          entry={entry}
                          onOpen={() => openFolder(entry)}
                          onPrefetch={() => prefetchFolder(entry)}
                        />
                      ) : (
                        <MediaFileCard key={`${entry.media?.id || entry.path}`} entry={entry} />
                      ),
                    )}
                  </div>
                ) : (
                  <EmptyState icon="W" title="لا توجد نتائج" text="جرّب إزالة البحث أو تغيير الفلتر." />
                )}
              </ContentSection>
              {browse.isLoading ? <ViewerSkeleton variant="folders" count={6} /> : null}
            </section>
          );
        }}
      </QueryBoundary>
    </div>
  );
}

function FolderCard({ entry, onOpen, onPrefetch }: { entry: LibraryBrowseEntry; onOpen: () => void; onPrefetch?: () => void }) {
  return (
    <button type="button" className="folder-card folder-card-cinematic" onClick={onOpen} onPointerEnter={onPrefetch} onFocus={onPrefetch}>
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
