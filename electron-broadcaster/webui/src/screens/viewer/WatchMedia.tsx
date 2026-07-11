import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLink, useAppPath } from "@/components/AppLink";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { FavoriteButton } from "@/components/common";
import { formatDuration } from "@/lib/format";
import { WivaPlayerControls } from "@/components/WivaPlayerControls";

type FitMode = "fit" | "fill" | "zoom";

export function WatchMedia() {
  const id = useAppPath().split("/").filter(Boolean).at(-1) || "";
  const media = useQuery({ queryKey: ["media", id], queryFn: () => api.media(id) });
  const viewer = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState, staleTime: 30_000 });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSavedAt = useRef(0);
  const restoredProgress = useRef(false);
  const bufferingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fitMode, setFitMode] = useState<FitMode>("fit");
  const [status, setStatus] = useState("جاري تجهيز المحتوى...");
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);

  const clearBuffering = () => {
    if (bufferingTimer.current) clearTimeout(bufferingTimer.current);
    bufferingTimer.current = null;
  };

  const scheduleBuffering = () => {
    if (bufferingTimer.current) return;
    bufferingTimer.current = setTimeout(() => {
      bufferingTimer.current = null;
      setStatus("الاتصال بطيء، نحاول متابعة التشغيل...");
    }, 3000);
  };

  useEffect(() => () => clearBuffering(), []);

  useEffect(() => {
    restoredProgress.current = false;
    lastSavedAt.current = 0;
  }, [id]);

  const restoreSavedProgress = (video: HTMLVideoElement, mediaId: string | number) => {
    if (restoredProgress.current || !viewer.data) return;
    restoredProgress.current = true;
    const saved = viewer.data.history?.find((row) => String(row.mediaId) === String(mediaId));
    const position = Number(saved?.position || 0);
    if (position > 5 && position < video.duration * 0.9) video.currentTime = position;
  };

  useEffect(() => {
    const video = videoRef.current;
    if (video && media.data?.id && video.readyState >= 1) restoreSavedProgress(video, media.data.id);
  }, [viewer.data, media.data?.id]);

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
                autoPlay
                playsInline
                preload="auto"
                controlsList="nodownload noplaybackrate"
                poster={item.poster}
                className={`media-player-video media-player-video-${fitMode}`}
                src={`/media/${item.id}`}
                onLoadStart={() => {
                  setError("");
                  setStarted(false);
                  setStatus("جاري تجهيز المحتوى...");
                }}
                onCanPlay={() => {
                  clearBuffering();
                  setError("");
                  setStatus("");
                }}
                onLoadedMetadata={(event) => {
                  restoreSavedProgress(event.currentTarget, item.id);
                }}
                onTimeUpdate={(event) => {
                  const now = Date.now();
                  if (now - lastSavedAt.current < 10_000) return;
                  lastSavedAt.current = now;
                  api.mediaProgress(item.id, { position: event.currentTarget.currentTime, duration: event.currentTarget.duration || 0 }).catch(() => {});
                }}
                onEnded={(event) => {
                  api.mediaProgress(item.id, { position: event.currentTarget.duration || 0, duration: event.currentTarget.duration || 0, completed: true }).catch(() => {});
                }}
                onPlaying={() => {
                  clearBuffering();
                  setStarted(true);
                  setError("");
                  setStatus("");
                }}
                onWaiting={scheduleBuffering}
                onStalled={scheduleBuffering}
                onError={() => {
                  setStatus("");
                  setError("تعذر تشغيل هذا المحتوى الآن.");
                }}
              />
              <WivaPlayerControls videoRef={videoRef} />
              {status || error ? (
                <div className={started && !error ? "live-player-recovery media-player-recovery" : "live-player-overlay media-player-overlay"}>
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
                <FavoriteButton mediaId={item.id} compact={false} />
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
