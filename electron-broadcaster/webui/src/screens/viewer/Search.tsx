import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { ChannelTile, ContentSection, MediaTile } from "@/components/common";
import { folderResults, getViewerChannels } from "./viewer-utils";

export function Search() {
  const [term, setTerm] = useState("");
  const library = useQuery({ queryKey: ["library"], queryFn: () => api.library() });
  const browse = useQuery({ queryKey: ["library-browse", "search-root"], queryFn: () => api.libraryBrowse() });
  const viewer = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState });

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
        <h1>ابحث في WIVA</h1>
        <p>قنوات مباشرة، مباريات، أفلام، مسلسلات، وإعادات في مكان واحد.</p>
        <input
          className="search-input-xl"
          placeholder="اكتب اسم قناة، فيلم، تصنيف، أو مجلد"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          autoFocus
        />
      </section>
      <QueryBoundary query={library} isEmpty={() => false}>
        {() =>
          mediaResults.length === 0 && channelResults.length === 0 && folderMatches.length === 0 ? (
            <EmptyState
              icon="•"
              title={term ? "لا نتائج" : "ابدأ البحث"}
              text={term ? "لم نجد شيئاً مطابقاً. جرّب كلمة أبسط أو تصنيفاً مختلفاً." : "اكتب كلمة للبحث في القنوات والمكتبة."}
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
                <ContentSection title="محتوى المكتبة" subtitle="نتائج مطابقة من محتوى الشبكة">
                  <div className="grid grid-auto">
                    {mediaResults.map((item) => (
                      <MediaTile key={item.id} item={item} />
                    ))}
                  </div>
                </ContentSection>
              ) : null}
              {folderMatches.length ? (
                <ContentSection title="أقسام المكتبة" subtitle="أقسام يمكنك تصفحها مباشرة">
                  <div className="guide-card-grid">
                    {folderMatches.map((entry) => (
                      <AppLink
                        key={`${entry.sourceId || "root"}-${entry.path || entry.name}`}
                        href="/library"
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
