import { useQuery } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api, type Channel } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader, ChannelTile } from "@/components/common";

export function Live() {
  const state = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState });

  return (
    <div>
      <PageHeader
        title="البث المباشر"
        subtitle="القنوات المتاحة للبث المباشر عبر الشبكة"
        actions={<AppLink href="/live/guide" className="btn btn-ghost">دليل القنوات</AppLink>}
      />
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
            icon="📡"
            title="لا توجد قنوات مباشرة"
            text="لم يقم المشرف بتفعيل أي قناة بث مباشر حتى الآن."
          />
        }
      >
        {(d) => {
          const channels = (((d.channels as Channel[]) || []).length
            ? (d.channels as Channel[])
            : [...(((d.broadcast as Channel[]) || [])), ...(((d.iptv as Channel[]) || []))]);
          return (
            <div className="live-channel-grid">
              {channels.map((ch) => (
                <ChannelTile key={String(ch.id)} channel={ch} href="/watch/channel/$id" />
              ))}
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
