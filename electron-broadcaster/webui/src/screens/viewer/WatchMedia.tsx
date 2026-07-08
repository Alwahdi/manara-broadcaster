import { useQuery } from "@tanstack/react-query";
import { AppLink, useAppPath } from "@/components/AppLink";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { formatDuration } from "@/lib/format";

export function WatchMedia() {
  const id = useAppPath().split("/").filter(Boolean).at(-1) || "";
  const media = useQuery({ queryKey: ["media", id], queryFn: () => api.media(id) });

  return (
    <div className="watch-media-page">
      <div className="watch-backdrop" aria-hidden />
      <QueryBoundary query={media}>
        {(item) => (
          <div>
            <div className="watch-channel-head player-page-head">
              <AppLink href="/library" className="btn btn-ghost btn-sm">
                ← الاستراحة
              </AppLink>
              <div>
                <span className="badge">الاستراحة</span>
                <h1 className="page-title">{item.title || item.name}</h1>
              </div>
            </div>
            <div className="media-player-shell">
              <div className="player-chrome-top">
                <span>مشغل الاستراحة</span>
                {item.durationSec ? <span>{formatDuration(item.durationSec)}</span> : null}
              </div>
              <video
                controls
                autoPlay
                playsInline
                poster={item.poster}
                className="media-player-video"
                src={`/media/${item.id}`}
              />
            </div>
            <div className="detail-panel">
              <div>
                <h2>{item.title || item.name}</h2>
                <p>{String(item.description || "محتوى متاح للمشاهدة داخل الشبكة.")}</p>
              </div>
              <div className="row">
                {item.category ? <span className="badge">{item.category}</span> : null}
                {item.durationSec ? <span className="badge">{formatDuration(item.durationSec)}</span> : null}
                {item.online === false ? <span className="badge badge-warn">غير متاح حاليًا</span> : null}
              </div>
            </div>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
