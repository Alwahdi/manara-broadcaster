import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Film, FolderOpen, Search } from "lucide-react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api, type LibraryBrowseEntry } from "@/lib/api";
import { QueryBoundary, EmptyState, ViewerSkeleton } from "@/components/States";
import { ContentSection, FavoriteButton, mediaKindLabel } from "@/components/common";
import { useLiveStatus } from "@/hooks/useLiveStatus";

/** Folder-first subscriber library view. */
export function LibraryFolders() {
  const queryClient = useQueryClient();
  const [sourceId, setSourceId] = useState<string>(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("sourceId") || "");
  const [path, setPath] = useState<string>(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("path") || "");
  const [term, setTerm] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadNotice, setUploadNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const viewer = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState, staleTime: 30_000 });
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncFromHistory = () => {
      const query = new URLSearchParams(window.location.search);
      setSourceId(query.get("sourceId") || "");
      setPath(query.get("path") || "");
    };
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

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

  const navigateTo = (nextSourceId: string, nextPath: string) => {
    setSourceId(nextSourceId);
    setPath(nextPath);
    const next = new URL(window.location.href);
    if (nextSourceId) next.searchParams.set("sourceId", nextSourceId); else next.searchParams.delete("sourceId");
    if (nextPath) next.searchParams.set("path", nextPath); else next.searchParams.delete("path");
    window.history.pushState({}, "", `${next.pathname}${next.search}${next.hash}`);
  };
  const openRoot = () => navigateTo("", "");
  const openSource = (id: string | number) => navigateTo(String(id), "");
  const openFolder = (entry: LibraryBrowseEntry) => {
    if (!entry.sourceId) return;
    navigateTo(String(entry.sourceId), entry.path || "");
  };

  const uploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || !sourceId) return;
    setUploading(true);
    setUploadNotice("");
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        await api.uploadLibraryFile(sourceId, path, file, (percent) => {
          setUploadProgress(Math.round(((index + percent / 100) / files.length) * 100));
        });
      }
      setUploadProgress(100);
      setUploadNotice(files.length === 1 ? "تم رفع الملف وظهر في المجلد." : `تم رفع ${files.length} ملفات بنجاح.`);
      await queryClient.invalidateQueries({ queryKey: ["library-browse", sourceId, path] });
      await browse.refetch();
    } catch (error) {
      setUploadNotice(error instanceof Error ? error.message : "تعذر رفع الملفات الآن.");
    } finally {
      setUploading(false);
    }
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
            return matchesTerm;
          });
          const singleSourceMode = (data.sources?.length || 0) === 1;
          const parentPath = data.breadcrumbs.length > 1 ? data.breadcrumbs.at(-2)?.path || "" : "";
          const canGoBack = Boolean(sourceId || path);
          return (
            <section className="folder-browser" aria-label="تصفح الاستراحة">
              {browse.isFetching && !browse.isLoading ? <div className="folder-refresh-line" aria-hidden /> : null}
              <div className="viewer-filter-bar">
                <label className="search-shell">
                  <Search size={19} aria-hidden />
                  <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="ابحث داخل هذا المجلد" />
                </label>
              </div>
              <nav className="folder-breadcrumbs" aria-label="تنقل الاستراحة">
                {canGoBack ? (
                  <button
                    type="button"
                    className="folder-back-button"
                    onClick={() => path ? navigateTo(sourceId, parentPath) : openRoot()}
                    aria-label="العودة إلى المجلد السابق"
                  >
                    <ArrowRight size={18} aria-hidden />
                    <span>رجوع</span>
                  </button>
                ) : null}
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
                    <button type="button" onClick={() => navigateTo(sourceId, crumb.path)}>{crumb.name}</button>
                  </span>
                ))}
              </nav>
              {viewer.data?.permissions?.manageLibrary && data.source ? (
                <aside className="library-manager-bar" aria-label="إدارة المجلد الحالي">
                  <div>
                    <span>إدارة هذا المجلد</span>
                    <strong>{data.breadcrumbs.at(-1)?.name || data.source.name || data.source.label || "القسم"}</strong>
                    <small>{uploading ? `جاري الرفع ${uploadProgress}%` : uploadNotice || "يمكنك رفع فيديو أو صوت أو كتاب أو مستند أو صورة غلاف هنا."}</small>
                  </div>
                  <div className="library-manager-actions">
                    <input
                      ref={fileInput}
                      type="file"
                      hidden
                      multiple
                      accept="video/*,audio/*,.mkv,.ts,.srt,.vtt,.pdf,.epub,.mobi,.azw,.azw3,.cbz,.cbr,.djvu,.txt,.md,.rtf,.doc,.docx,.odt,.ppt,.pptx,.xls,.xlsx,.csv,image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp"
                      onChange={uploadFiles}
                    />
                    <button type="button" className="btn btn-primary" disabled={uploading} onClick={() => fileInput.current?.click()}>
                      {uploading ? "جاري الرفع…" : "رفع محتوى"}
                    </button>
                  </div>
                  {uploading ? <span className="library-upload-progress"><i style={{ width: `${uploadProgress}%` }} /></span> : null}
                </aside>
              ) : null}
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
        <ArtworkImage src={entry.cover} kind="folder" />
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
          <ArtworkImage src={entry.cover} kind="media" />
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
    <div className="folder-card-wrap">
      <AppLink
        href="/watch/media/$id"
        params={{ id: mediaId }}
        className="folder-card folder-file-card"
      >
        <div className="folder-card-art">
          <ArtworkImage src={entry.cover} kind="media" />
          {!entry.online ? <span className="offline-ribbon">غير متاح حاليًا</span> : null}
        </div>
        <div className="folder-card-body">
          <span className="folder-card-title">{title}</span>
          <span className="folder-card-sub">{item?.category || mediaKindLabel(item?.kind)}</span>
        </div>
      </AppLink>
      <FavoriteButton mediaId={mediaId} />
    </div>
  );
}

function ArtworkImage({ src, kind }: { src?: string; kind: "folder" | "media" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (src && !failed) {
    return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  }
  return (
    <span className="folder-art-placeholder" aria-hidden>
      {kind === "folder" ? <FolderOpen size={34} /> : <Film size={34} />}
    </span>
  );
}
