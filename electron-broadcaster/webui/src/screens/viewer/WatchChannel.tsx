import { useQuery } from "@tanstack/react-query";
import { AppLink, useAppPath } from "@/components/AppLink";
import { api, type Channel } from "@/lib/api";
import { QueryBoundary } from "@/components/States";

export function WatchChannel() {
  const id = useAppPath().split("/").filter(Boolean).at(-1) || "";
  const state = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState });

  return (
    <div>
      <AppLink href="/live" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>
        ← البث المباشر
      </AppLink>
      <QueryBoundary query={state}>
        {(data) => {
          const channels = (((data.channels as Channel[]) || []).length
            ? (data.channels as Channel[])
            : [...(((data.broadcast as Channel[]) || [])), ...(((data.iptv as Channel[]) || []))]);
          const channel = channels.find((ch) => String(ch.id) === String(id));
          const src = channel?.playUrl || `/iptv/${encodeURIComponent(id)}/index.m3u8`;
          return (
            <>
              <div className="card" style={{ overflow: "hidden", marginBottom: 20 }}>
                <video
                  controls
                  autoPlay
                  playsInline
                  style={{ width: "100%", aspectRatio: "16/9", background: "#000", display: "block" }}
                  src={src}
                />
              </div>
              <div className="row-between">
                <h1 className="page-title">{channel?.name || `القناة ${id}`}</h1>
                <span className="badge badge-dot badge-live">بث مباشر</span>
              </div>
              <p className="page-subtitle">
                إذا لم يبدأ التشغيل تلقائيًا، جرّب إعادة فتح القناة أو اختر جودة أخرى من قائمة IPTV عند توفرها.
              </p>
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
