import { FormEvent, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import { AppLink } from "@/components/AppLink";
import { api } from "@/lib/api";
import { QueryBoundary, EmptyState, ViewerSkeleton } from "@/components/States";
import { ChannelTile, ContentSection, MediaTile } from "@/components/common";
import { folderResults, getViewerChannels } from "./viewer-utils";

export function Search() {
  const [term, setTerm] = useState("");
  const [recent, setRecent] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem("wiva:recent-searches") || "[]").slice(0, 6); }
    catch { return []; }
  });
  const library = useQuery({ queryKey: ["library"], queryFn: () => api.library() });
  const browse = useQuery({ queryKey: ["library-browse", "search-root"], queryFn: () => api.libraryBrowse() });
  const viewer = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState });

  const mediaResults = useMemo(() => {
    const items = library.data?.items || [];
    const q = term.trim().toLowerCase();
    if (!q) return [];
    return items.filter((it) =>
      `${it.title || ""} ${it.name || ""} ${it.category || ""} ${it.folder || ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [library.data, term]);
  const channelResults = useMemo(() => {
    const channels = getViewerChannels(viewer.data);
    const q = term.trim().toLowerCase();
    if (!q) return [];
    return channels.filter((channel) =>
      `${channel.name || ""} ${channel.group || ""} ${channel.category || ""}`.toLowerCase().includes(q),
    );
  }, [viewer.data, term]);
  const folderMatches = useMemo(() => {
    if (!term.trim()) return [];
    return folderResults(browse.data?.entries, term).filter((entry) => entry.type === "folder").slice(0, 12);
  }, [browse.data, term]);

  const rememberSearch = (value: string) => {
    const clean = value.trim();
    if (clean.length < 2) return;
    const next = [clean, ...recent.filter((item) => item !== clean)].slice(0, 6);
    setRecent(next);
    window.localStorage.setItem("wiva:recent-searches", JSON.stringify(next));
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    rememberSearch(term);
  };

  const hasTerm = term.trim().length > 0;

  return (
    <div className="search-page">
      <header className="viewer-page-intro viewer-search-head">
        <h1>البحث</h1>
        <p>ابحث عن قناة أو مجلد أو محتوى متاح.</p>
        <form className="viewer-search-form" onSubmit={submitSearch} role="search">
          <SearchIcon size={21} aria-hidden />
          <input
            className="search-input-xl"
            placeholder="اكتب اسم القناة أو المحتوى"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          {term ? <button type="button" onClick={() => setTerm("")}>مسح</button> : null}
        </form>
        {!hasTerm && recent.length ? (
          <div className="recent-searches" aria-label="عمليات البحث الأخيرة">
            <span>بحثت مؤخرًا</span>
            {recent.map((item) => <button type="button" key={item} onClick={() => setTerm(item)}>{item}</button>)}
          </div>
        ) : null}
      </header>
      <QueryBoundary query={library} isEmpty={() => false}>
        {() =>
          hasTerm && (library.isLoading || viewer.isLoading || browse.isLoading) ? (
            <ViewerSkeleton variant="search" count={5} />
          ) : !hasTerm ? (
            <EmptyState icon="بحث" title="ماذا تريد أن تشاهد؟" text="اكتب اسم قناة أو محتوى أو مجلد لعرض النتائج." />
          ) : mediaResults.length === 0 && channelResults.length === 0 && folderMatches.length === 0 ? (
            <EmptyState
              icon="W"
              title="لم نجد نتائج مطابقة"
              text="جرّب كلمة أبسط أو ابحث باسم آخر."
            />
          ) : (
            <>
              {channelResults.length ? (
                <ContentSection title="قنوات مباشرة" subtitle="نتائج من البث المباشر">
                  <div className="live-channel-grid horizontal-rail">
                    {channelResults.map((channel) => (
                      <ChannelTile key={String(channel.id)} channel={channel} href="/watch/channel/$id" />
                    ))}
                  </div>
                </ContentSection>
              ) : null}
              {mediaResults.length ? (
                <ContentSection title="محتوى الاستراحة" subtitle="نتائج مطابقة من محتوى الشبكة">
                  <div className="grid grid-auto">
                    {mediaResults.map((item) => (
                      <MediaTile key={item.id} item={item} />
                    ))}
                  </div>
                </ContentSection>
              ) : null}
              {folderMatches.length ? (
                <ContentSection title="أقسام الاستراحة" subtitle="أقسام يمكنك تصفحها مباشرة">
                  <div className="guide-card-grid">
                    {folderMatches.map((entry) => (
                      <AppLink
                        key={`${entry.sourceId || "root"}-${entry.path || entry.name}`}
                        href={`/library/folders?sourceId=${encodeURIComponent(String(entry.sourceId || ""))}&path=${encodeURIComponent(entry.path || "")}`}
                        className="guide-card"
                      >
                        <span className="guide-card-logo">
                          {entry.cover ? <img src={entry.cover} alt="" /> : <span>{String(entry.name || "W").slice(0, 1)}</span>}
                        </span>
                        <span className="guide-card-info">
                          <strong>{entry.name}</strong>
                          <small>{entry.count || 0} عنصر</small>
                        </span>
                        <span className="guide-folder-label">قسم</span>
                      </AppLink>
                    ))}
                  </div>
                </ContentSection>
              ) : null}
            </>
          )
        }
      </QueryBoundary>
    </div>
  );
}
