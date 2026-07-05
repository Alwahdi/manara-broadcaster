import { useQuery } from "@tanstack/react-query";
import { AppLink, useAppPath } from "@/components/AppLink";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { formatDuration } from "@/lib/format";

export function WatchMedia() {
  const id = useAppPath().split("/").filter(Boolean).at(-1) || "";
  const media = useQuery({ queryKey: ["media", id], queryFn: () => api.media(id) });

  return (
    <div>
      <AppLink href="/library" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>
        ← المكتبة
      </AppLink>
      <QueryBoundary query={media}>
        {(item) => (
          <div>
            <div className="card" style={{ overflow: "hidden", marginBottom: 20 }}>
              <video
                controls
                autoPlay
                playsInline
                poster={item.poster}
                style={{ width: "100%", aspectRatio: "16/9", background: "#000", display: "block" }}
                src={`/media/${item.id}`}
              />
            </div>
            <h1 className="page-title">{item.title || item.name}</h1>
            <div className="row" style={{ marginTop: 8 }}>
              {item.category ? <span className="badge">{item.category}</span> : null}
              {item.durationSec ? <span className="badge">{formatDuration(item.durationSec)}</span> : null}
              {item.online === false ? <span className="badge badge-warn">المصدر غير متصل</span> : null}
            </div>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
