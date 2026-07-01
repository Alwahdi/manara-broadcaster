import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader, ChannelTile } from "@/components/common";

export function Live() {
  const state = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState });

  return (
    <div>
      <PageHeader
        title="البث المباشر"
        subtitle="القنوات المتاحة للبث المباشر عبر الشبكة"
        actions={<Link to="/live/guide" className="btn btn-ghost">دليل القنوات</Link>}
      />
      <QueryBoundary
        query={state}
        isEmpty={(d) => {
          const list = (d.channels as unknown[]) || (d.iptv as unknown[]) || [];
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
          const channels = ((d.channels as never[]) || (d.iptv as never[]) || []) as {
            id: number | string;
            name: string;
            enabled?: boolean;
          }[];
          return (
            <div className="grid grid-3">
              {channels.map((ch) => (
                <ChannelTile key={String(ch.id)} channel={ch} to="/watch/channel/$id" />
              ))}
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
