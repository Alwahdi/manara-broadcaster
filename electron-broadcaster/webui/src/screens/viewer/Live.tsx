import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { CategoryChips, ChannelTile, ContentSection } from "@/components/common";
import { filterChannels, getViewerChannels } from "./viewer-utils";

const FILTERS = [
  { value: "all", label: "الكل" },
  { value: "sports", label: "رياضة" },
  { value: "news", label: "أخبار" },
  { value: "movies", label: "أفلام" },
  { value: "kids", label: "أطفال" },
];

export function Live() {
  const state = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState });
  const [filter, setFilter] = useState("all");
  const [term, setTerm] = useState("");

  const channels = useMemo(() => {
    return getViewerChannels(state.data);
  }, [state.data]);

  const filtered = useMemo(() => {
    return filterChannels(channels, filter, term);
  }, [channels, filter, term]);

  const featured = filtered.find((channel) => channel.enabled !== false && channel.enabled !== 0) || filtered[0] || channels[0];

  return (
    <div className="live-page">
      <section className="live-feature-card">
        <div>
          <span className="badge badge-dot badge-live">LIVE</span>
          <h1>{featured?.name || "البث المباشر"}</h1>
          <p>{featured?.description || "كل القنوات المباشرة المتاحة على الشبكة في مكان واحد، بتصفح سريع ومناسب للجوال."}</p>
          <div className="row">
            {featured ? (
              <AppLink href="/watch/channel/$id" params={{ id: String(featured.id) }} className="btn btn-primary">
                تشغيل القناة
              </AppLink>
            ) : null}
            <AppLink href="/live/guide" className="btn btn-ghost">دليل القنوات</AppLink>
          </div>
        </div>
        <div className="live-feature-art" aria-hidden>
          {featured?.logo ? <img src={featured.logo} alt="" /> : <span>LIVE</span>}
        </div>
      </section>

      <div className="viewer-filter-bar">
        <label className="search-shell">
          <span>بحث</span>
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="ابحث باسم القناة أو التصنيف"
          />
        </label>
        <CategoryChips items={FILTERS} value={filter} onChange={setFilter} />
      </div>

      <QueryBoundary
        query={state}
        isEmpty={(d) => {
          const list = ((d.channels as unknown[]) || []).length
            ? (d.channels as unknown[])
            : [...((d.broadcast as unknown[]) || []), ...((d.iptv as unknown[]) || [])];
          return list.length === 0;
        }}
        empty={
          <EmptyState
            icon="W"
            title="لا توجد قنوات مباشرة"
            text="لا توجد قنوات متاحة حاليًا. ستظهر هنا عند توفر بث مباشر على الشبكة."
          />
        }
      >
        {() => filtered.length === 0 ? (
          <EmptyState
            icon="•"
            title="لا توجد نتائج مطابقة"
            text="جرّب إزالة الفلتر أو البحث باسم قناة مختلف."
          />
        ) : (
          <>
            <ContentSection title="يبث الآن" subtitle={`${filtered.length} قناة جاهزة للمشاهدة`}>
              <div className="live-channel-grid">
                {filtered.map((ch) => (
                  <ChannelTile key={String(ch.id)} channel={ch} href="/watch/channel/$id" />
                ))}
              </div>
            </ContentSection>
            <ContentSection title="جدول سريع" subtitle="نظرة عملية مناسبة للجوال والكمبيوتر">
              <div className="tv-guide-list">
                {filtered.slice(0, 12).map((channel) => (
                  <AppLink key={String(channel.id)} href="/watch/channel/$id" params={{ id: String(channel.id) }} className="tv-guide-row">
                    <span className="guide-time">الآن</span>
                    <span className="guide-logo">{channel.logo ? <img src={channel.logo} alt="" /> : "W"}</span>
                    <span className="guide-info">
                      <strong>{channel.name}</strong>
                      <small>{channel.group || channel.category || "بث مباشر"}</small>
                    </span>
                    <span className="badge badge-dot badge-live">LIVE</span>
                  </AppLink>
                ))}
              </div>
            </ContentSection>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
