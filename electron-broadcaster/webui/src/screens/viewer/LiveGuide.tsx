import { useQuery } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { ChannelTile, ContentSection, PageHeader } from "@/components/common";
import { getViewerChannels } from "./viewer-utils";

export function LiveGuide() {
  const state = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState });
  return (
    <div className="live-guide-page">
      <PageHeader
        title="دليل القنوات"
        subtitle="اختر قناة وشاهد البث المتاح الآن"
        actions={<AppLink href="/live" className="btn btn-ghost btn-sm">القنوات المباشرة</AppLink>}
      />
      <QueryBoundary
        query={state}
        isEmpty={(d) => {
          return getViewerChannels(d).length === 0;
        }}
        empty={<EmptyState icon="W" title="لا توجد قنوات متاحة حاليًا" text="ستظهر القنوات هنا عند توفر بث مباشر على الشبكة." />}
      >
        {(d) => {
          const channels = getViewerChannels(d);
          return (
            <ContentSection title="القنوات المتاحة" subtitle={`${channels.length} قناة في الدليل`}>
              <div className="live-channel-grid">
                {channels.map((ch) => (
                  <ChannelTile key={String(ch.id)} channel={ch} href="/watch/channel/$id" />
                ))}
              </div>
            </ContentSection>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
