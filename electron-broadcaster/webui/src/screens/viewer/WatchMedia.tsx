import { useEffect, useRef, useState, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLink, useAppPath } from "@/components/AppLink";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { FavoriteButton, ShareButton } from "@/components/common";
import { formatDuration } from "@/lib/format";
import { WivaMediaPlayer } from "@/components/WivaMediaPlayer";

export function WatchMedia() {
  const id = useAppPath().split("/").filter(Boolean).at(-1) || "";
  const media = useQuery({ queryKey: ["media", id], queryFn: () => api.media(id) });
  const viewer = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState, staleTime: 30_000 });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSavedAt = useRef(0);
  const restoredProgress = useRef(false);
  const bufferingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
            <AppLink href="/library" className="btn btn-ghost btn-sm player-back-link">
              ← الاستراحة
            </AppLink>
            <WivaMediaPlayer
              videoRef={videoRef}
              mode="vod"
              status={status}
              error={error}
              started={started}
              meta={item.durationSec ? <span>{formatDuration(item.durationSec)}</span> : undefined}
              settings={<MediaPlaybackSettings videoRef={videoRef} />}
              onRetry={retryPlayback}
              videoProps={{
                autoPlay: true,
                preload: "auto",
                poster: item.poster,
                src: `/media/${item.id}`,
                onLoadStart: () => {
                  setError("");
                  setStarted(false);
                  setStatus("جاري تجهيز المحتوى...");
                },
                onCanPlay: () => {
                  clearBuffering();
                  setError("");
                  setStatus("");
                },
                onLoadedMetadata: (event) => restoreSavedProgress(event.currentTarget, item.id),
                onTimeUpdate: (event) => {
                  const now = Date.now();
                  if (now - lastSavedAt.current < 10_000) return;
                  lastSavedAt.current = now;
                  api.mediaProgress(item.id, { position: event.currentTarget.currentTime, duration: event.currentTarget.duration || 0 }).catch(() => {});
                },
                onEnded: (event) => {
                  api.mediaProgress(item.id, { position: event.currentTarget.duration || 0, duration: event.currentTarget.duration || 0, completed: true }).catch(() => {});
                },
                onPlaying: () => {
                  clearBuffering();
                  setStarted(true);
                  setError("");
                  setStatus("");
                },
                onWaiting: scheduleBuffering,
                onStalled: scheduleBuffering,
                onError: () => {
                  setStatus("");
                  setError("تعذر تشغيل هذا المحتوى الآن. تحقق من اتصال الشبكة ثم حاول مرة أخرى.");
                },
              }}
            />
            <div className="detail-panel">
              <div>
                <h2>{item.title || item.name}</h2>
                <p>{String(item.description || "محتوى متاح للمشاهدة داخل الشبكة.")}</p>
              </div>
              <div className="row">
                <FavoriteButton mediaId={item.id} compact={false} />
                <ShareButton />
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

function MediaPlaybackSettings({ videoRef }: { videoRef: RefObject<HTMLVideoElement | null> }) {
  const [speed, setSpeed] = useState(() => {
    try { return Number(localStorage.getItem("wiva-player-speed")) || 1; } catch { return 1; }
  });

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
    try { localStorage.setItem("wiva-player-speed", String(speed)); } catch {}
  }, [speed, videoRef]);

  return (
    <label className="wiva-player-quality" role="menuitem">
      <span>سرعة التشغيل</span>
      <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} aria-label="سرعة التشغيل">
        <option value="0.75">0.75×</option>
        <option value="1">عادية</option>
        <option value="1.25">1.25×</option>
        <option value="1.5">1.5×</option>
        <option value="2">2×</option>
      </select>
    </label>
  );
}
