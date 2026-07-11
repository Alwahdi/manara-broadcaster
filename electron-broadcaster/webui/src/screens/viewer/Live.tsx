import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api } from "@/lib/api";
import { QueryBoundary, EmptyState, ViewerSkeleton } from "@/components/States";
import { CategoryChips, ChannelTile, ContentSection, PageHeader } from "@/components/common";
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

  return (
    <div className="live-page">
      <PageHeader
        title="البث المباشر"
        subtitle="اختر قناة وابدأ المشاهدة فورًا"
        actions={<AppLink href="/live/guide" className="btn btn-ghost btn-sm">دليل القنوات</AppLink>}
      />

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
            icon="W"
            title="لا توجد نتائج مطابقة"
            text="جرّب إزالة الفلتر أو البحث باسم قناة مختلف."
          />
        ) : (
          <>
            <ContentSection title="القنوات المتاحة" subtitle={`${filtered.length} قناة`}>
              <div className="live-channel-grid">
                {filtered.map((ch) => (
                  <ChannelTile key={String(ch.id)} channel={ch} href="/watch/channel/$id" />
                ))}
              </div>
            </ContentSection>
          </>
        )}
      </QueryBoundary>
      {state.isLoading ? <ViewerSkeleton count={6} /> : null}
    </div>
  );
}
