import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Channel } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { ChannelTile, ContentSection, MediaTile } from "@/components/common";

export function Search() {
  const [term, setTerm] = useState("");
  const library = useQuery({ queryKey: ["library"], queryFn: () => api.library() });
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
    const data = viewer.data;
    const channels = data
      ? (((data.channels as Channel[]) || []).length
        ? (data.channels as Channel[])
        : [...(((data.broadcast as Channel[]) || [])), ...(((data.iptv as Channel[]) || []))])
      : [];
    const q = term.trim().toLowerCase();
    if (!q) return channels.slice(0, 8);
    return channels.filter((channel) =>
      `${channel.name || ""} ${channel.group || ""} ${channel.category || ""}`.toLowerCase().includes(q),
    );
  }, [viewer.data, term]);

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
          mediaResults.length === 0 && channelResults.length === 0 ? (
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
                <ContentSection title="المكتبة" subtitle="أفلام وملفات ومجلدات مطابقة">
                  <div className="grid grid-auto">
                    {mediaResults.map((item) => (
                      <MediaTile key={item.id} item={item} />
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
