import type { ReactNode, RefObject, VideoHTMLAttributes } from "react";
import { WivaPlayerControls } from "@/components/WivaPlayerControls";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  mode: "live" | "vod";
  status?: string;
  error?: string;
  started?: boolean;
  settings?: ReactNode;
  meta?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  videoProps?: Omit<VideoHTMLAttributes<HTMLVideoElement>, "ref">;
};

export function WivaMediaPlayer({
  videoRef,
  mode,
  status = "",
  error = "",
  started = false,
  settings,
  meta,
  onRetry,
  retryLabel = "إعادة المحاولة",
  videoProps,
}: Props) {
  const live = mode === "live";
  const blocked = !!(error || (status && !started));
  return (
    <div
      className={`${live ? "live-player-card" : "media-player-shell"} wiva-player${blocked ? " is-blocked" : ""}`}
      tabIndex={0}
      aria-label={live ? "مشغل البث المباشر" : "مشغل الاستراحة"}
    >
      {live || meta ? (
        <div className="player-chrome-top">
          {live ? <span className="badge badge-dot badge-live">مباشر</span> : null}
          {meta}
        </div>
      ) : null}
      <video
        {...videoProps}
        ref={videoRef}
        playsInline
        controlsList={live ? "nodownload noplaybackrate" : "nodownload"}
        className={live ? "live-player-video" : "media-player-video"}
      />
      <WivaPlayerControls videoRef={videoRef} live={live} settings={settings} />
      {status || error ? (
        <div className={started && !error ? "live-player-recovery media-player-recovery" : `live-player-overlay${live ? "" : " media-player-overlay"}`} aria-live="polite">
          <div>
            {status && !error ? <div className="spinner overlay-spinner" /> : null}
            <strong>{error || status}</strong>
            {error && onRetry ? (
              <div className="overlay-action">
                <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
                  {retryLabel}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
