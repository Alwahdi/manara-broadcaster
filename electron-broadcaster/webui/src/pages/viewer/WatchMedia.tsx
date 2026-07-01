import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { formatDuration } from "@/lib/format";

export function WatchMedia() {
  const { id } = useParams({ from: "/viewer/watch/media/$id" });
  const media = useQuery({ queryKey: ["media", id], queryFn: () => api.media(id) });

  return (
    <div>
      <Link to="/library" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>
        ← المكتبة
      </Link>
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
