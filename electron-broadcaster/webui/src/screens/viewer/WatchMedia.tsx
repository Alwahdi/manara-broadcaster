import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLink, useAppPath } from "@/components/AppLink";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { formatDuration } from "@/lib/format";

type FitMode = "fit" | "fill" | "zoom";

export function WatchMedia() {
  const id = useAppPath().split("/").filter(Boolean).at(-1) || "";
  const media = useQuery({ queryKey: ["media", id], queryFn: () => api.media(id) });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [fitMode, setFitMode] = useState<FitMode>("fit");
  const [status, setStatus] = useState("جاري تجهيز المحتوى...");
  const [error, setError] = useState("");

  const retryPlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    setError("");
    setStatus("جاري تشغيل المحتوى...");
    try {
      video.load();
      video.play().catch(() => {});
    } catch {}
  };

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
              <MediaFitToolbar fitMode={fitMode} setFitMode={setFitMode} />
              <video
                ref={videoRef}
                controls
                autoPlay
                playsInline
                preload="auto"
                poster={item.poster}
                className={`media-player-video media-player-video-${fitMode}`}
                src={`/media/${item.id}`}
                onLoadStart={() => {
                  setError("");
                  setStatus("جاري تجهيز المحتوى...");
                }}
                onCanPlay={() => {
                  setError("");
                  setStatus("");
                }}
                onPlaying={() => {
                  setError("");
                  setStatus("");
                }}
                onWaiting={() => setStatus("جاري تحسين التشغيل...")}
                onStalled={() => setStatus("جاري تحسين التشغيل...")}
                onError={() => {
                  setStatus("");
                  setError("تعذر تشغيل هذا المحتوى الآن.");
                }}
              />
              {status || error ? (
                <div className="live-player-overlay media-player-overlay">
                  <div>
                    {status && !error ? <div className="spinner overlay-spinner" /> : null}
                    <strong>{error || status}</strong>
                    {error ? (
                      <div className="overlay-action">
                        <button type="button" className="btn btn-primary btn-sm" onClick={retryPlayback}>
                          إعادة المحاولة
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
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

function MediaFitToolbar({
  fitMode,
  setFitMode,
}: {
  fitMode: FitMode;
  setFitMode: (mode: FitMode) => void;
}) {
  return (
    <div className="live-player-toolbar media-player-toolbar" aria-label="حجم صورة المحتوى">
      {([
        ["fit", "كامل"],
        ["fill", "ملء"],
        ["zoom", "تقريب"],
      ] as const).map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          className={fitMode === mode ? "active" : ""}
          onClick={() => setFitMode(mode)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
