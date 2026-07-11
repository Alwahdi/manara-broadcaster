import { useEffect, useState, type ReactNode, type RefObject } from "react";
import {
  Cast,
  Maximize,
  Pause,
  PictureInPicture2,
  Play,
  Share2,
  Volume2,
  VolumeX,
} from "lucide-react";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  live?: boolean;
  extra?: ReactNode;
};

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  const minutes = Math.floor(value / 60) % 60;
  const hours = Math.floor(value / 3600);
  return hours ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

export function WivaPlayerControls({ videoRef, live = false, extra }: Props) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shareLabel, setShareLabel] = useState("");
  const [remoteAvailable, setRemoteAvailable] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const sync = () => {
      setPlaying(!video.paused && !video.ended);
      setMuted(video.muted);
      setVolume(video.volume);
      setCurrentTime(video.currentTime || 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    };
    setRemoteAvailable(!!(video as HTMLVideoElement & { remote?: unknown }).remote);
    const events = ["play", "pause", "ended", "volumechange", "timeupdate", "durationchange", "loadedmetadata"];
    events.forEach((event) => video.addEventListener(event, sync));
    sync();
    return () => events.forEach((event) => video.removeEventListener(event, sync));
  }, [videoRef]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  };

  const changeVolume = (next: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = next;
    video.muted = next === 0;
  };

  const toggleFullscreen = async () => {
    const video = videoRef.current;
    if (!video) return;
    const shell = video.closest<HTMLElement>(".live-player-card, .media-player-shell") || video;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (shell.requestFullscreen) await shell.requestFullscreen();
      else (video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.();
    } catch {}
  };

  const togglePictureInPicture = async () => {
    const video = videoRef.current;
    if (!video || !("pictureInPictureEnabled" in document)) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (video.requestPictureInPicture) await video.requestPictureInPicture();
    } catch {}
  };

  const share = async () => {
    const payload = { title: document.title, text: "شاهد هذا المحتوى على شبكة WIVA", url: window.location.href };
    try {
      if (navigator.share) await navigator.share(payload);
      else {
        await navigator.clipboard.writeText(payload.url);
        setShareLabel("تم نسخ الرابط");
        window.setTimeout(() => setShareLabel(""), 1800);
      }
    } catch {}
  };

  const cast = async () => {
    const video = videoRef.current as (HTMLVideoElement & { remote?: { prompt?: () => Promise<void> } }) | null;
    try { await video?.remote?.prompt?.(); } catch {}
  };

  return (
    <div className="wiva-player-controls" dir="rtl">
      {!live && duration > 0 ? (
        <div className="wiva-player-progress">
          <input
            aria-label="موضع التشغيل"
            type="range"
            min="0"
            max={Math.max(duration, 1)}
            step="0.1"
            value={Math.min(currentTime, duration)}
            onChange={(event) => {
              if (videoRef.current) videoRef.current.currentTime = Number(event.target.value);
            }}
          />
          <span dir="ltr">{formatTime(currentTime)} / {formatTime(duration)}</span>
        </div>
      ) : null}
      <div className="wiva-player-control-row">
        <div className="wiva-player-control-group">
          <button type="button" className="player-icon-btn player-primary-btn" onClick={togglePlayback} title={playing ? "إيقاف مؤقت" : "تشغيل"} aria-label={playing ? "إيقاف مؤقت" : "تشغيل"}>
            {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <button type="button" className="player-icon-btn" onClick={toggleMute} title={muted ? "تشغيل الصوت" : "كتم الصوت"} aria-label={muted ? "تشغيل الصوت" : "كتم الصوت"}>
            {muted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <input
            className="wiva-player-volume"
            aria-label="مستوى الصوت"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={muted ? 0 : volume}
            onChange={(event) => changeVolume(Number(event.target.value))}
          />
          {live ? <span className="wiva-player-live"><i /> مباشر</span> : null}
        </div>
        {extra ? <div className="wiva-player-extra">{extra}</div> : null}
        <div className="wiva-player-control-group">
          {shareLabel ? <span className="wiva-player-feedback">{shareLabel}</span> : null}
          <button type="button" className="player-icon-btn" onClick={share} title="مشاركة" aria-label="مشاركة"><Share2 size={19} /></button>
          {remoteAvailable ? <button type="button" className="player-icon-btn" onClick={cast} title="عرض على جهاز آخر" aria-label="عرض على جهاز آخر"><Cast size={19} /></button> : null}
          <button type="button" className="player-icon-btn player-pip-btn" onClick={togglePictureInPicture} title="صورة داخل صورة" aria-label="صورة داخل صورة"><PictureInPicture2 size={19} /></button>
          <button type="button" className="player-icon-btn" onClick={toggleFullscreen} title="ملء الشاشة" aria-label="ملء الشاشة"><Maximize size={19} /></button>
        </div>
      </div>
    </div>
  );
}
