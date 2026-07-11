import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api } from "@/lib/api";
import { useBrand } from "@/hooks/useBrand";
import { QueryBoundary, EmptyState, ViewerSkeleton } from "@/components/States";
import { ChannelTile, ContentSection, MediaTile } from "@/components/common";
import { folderResults, getViewerChannels } from "./viewer-utils";

export function Search() {
  const { brand } = useBrand();
  const [term, setTerm] = useState("");
  const library = useQuery({ queryKey: ["library"], queryFn: () => api.library(), staleTime: 5 * 60_000, gcTime: 30 * 60_000, refetchOnWindowFocus: false });
  const browse = useQuery({ queryKey: ["library-browse", "search-root"], queryFn: () => api.libraryBrowse(), staleTime: 30 * 60_000, gcTime: 60 * 60_000, refetchOnWindowFocus: false });
  const viewer = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState, staleTime: 30_000, refetchOnWindowFocus: false });

  const mediaResults = useMemo(() => {
    const items = library.data?.items || [];
    const q = term.trim().toLowerCase();
    if (!q) return items.slice(0, 18);
    return items.filter((it) =>
      `${it.title || ""} ${it.name || ""} ${it.category || ""} ${it.folder || ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [library.data, term]);
  const channelResults = useMemo(() => {
    const channels = getViewerChannels(viewer.data);
    const q = term.trim().toLowerCase();
    if (!q) return channels.slice(0, 8);
    return channels.filter((channel) =>
      `${channel.name || ""} ${channel.group || ""} ${channel.category || ""}`.toLowerCase().includes(q),
    );
  }, [viewer.data, term]);
  const folderMatches = useMemo(() => {
    return folderResults(browse.data?.entries, term).filter((entry) => entry.type === "folder").slice(0, term.trim() ? 12 : 8);
  }, [browse.data, term]);

  return (
    <div className="search-page">
      <section className="search-hero">
        <div className="search-visual" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <h1>ابحث في {brand}</h1>
        <p>ابحث عن القنوات والمجلدات والمحتوى المتاح داخل الشبكة.</p>
        <input
          className="search-input-xl"
          placeholder="ابحث عن قناة، قسم، أو محتوى"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          autoFocus
        />
      </section>
      <QueryBoundary query={library} isEmpty={() => false}>
        {() =>
          library.isLoading || viewer.isLoading || browse.isLoading ? (
            <ViewerSkeleton variant="search" count={5} />
          ) : mediaResults.length === 0 && channelResults.length === 0 && folderMatches.length === 0 ? (
            <EmptyState
              icon="W"
              title={term ? "لم نجد نتائج مطابقة" : "ابدأ بالبحث"}
              text={term ? "جرّب كلمة أبسط أو ابحث باسم آخر." : "ابحث عن القنوات والمحتوى المتاح داخل الشبكة."}
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
                        <span className="quality-badge">قسم</span>
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
