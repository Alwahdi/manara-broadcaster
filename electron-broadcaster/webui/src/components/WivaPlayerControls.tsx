import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import {
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  Settings,
  Volume2,
  VolumeX,
} from "lucide-react";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  live?: boolean;
  settings?: ReactNode;
};

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  const minutes = Math.floor(value / 60) % 60;
  const hours = Math.floor(value / 3600);
  return hours ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

function getPlayerShell(video: HTMLVideoElement | null) {
  return video?.closest<HTMLElement>(".wiva-player") || null;
}

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return !!element?.closest("input, textarea, select, [contenteditable='true']");
}

export function WivaPlayerControls({ videoRef, live = false, settings }: Props) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pipAvailable, setPipAvailable] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const controlsVisibleRef = useRef(true);
  const audioInitializedRef = useRef(false);

  const canAutoHide = useCallback(() => (
    typeof window !== "undefined"
    && window.innerWidth > 720
    && window.matchMedia("(hover: hover) and (pointer: fine)").matches
  ), []);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }, []);

  const revealControls = useCallback((keepVisible = false) => {
    clearHideTimer();
    controlsVisibleRef.current = true;
    setControlsVisible(true);
    const video = videoRef.current;
    if (!keepVisible && canAutoHide() && video && !video.paused && !settingsOpen) {
      hideTimer.current = setTimeout(() => {
        controlsVisibleRef.current = false;
        setControlsVisible(false);
      }, 3000);
    }
  }, [canAutoHide, clearHideTimer, settingsOpen, videoRef]);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
    revealControls(video.paused);
  }, [revealControls, videoRef]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, [videoRef]);

  const changeVolume = useCallback((next: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = next;
    video.muted = next === 0;
  }, [videoRef]);

  const toggleFullscreen = useCallback(async () => {
    const video = videoRef.current;
    const shell = getPlayerShell(video);
    if (!video || !shell) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (shell.requestFullscreen) await shell.requestFullscreen();
      else (video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.();
    } catch {}
  }, [videoRef]);

  const togglePictureInPicture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled || typeof video.requestPictureInPicture !== "function") return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {}
  }, [videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    const shell = getPlayerShell(video);
    if (!video || !shell) return undefined;

    if (!audioInitializedRef.current) {
      audioInitializedRef.current = true;
      try {
        const savedVolume = Number(localStorage.getItem("wiva-player-volume"));
        if (Number.isFinite(savedVolume) && savedVolume > 0 && savedVolume <= 1) video.volume = savedVolume;
      } catch {}
      video.muted = false;
    }

    let lastProgressUpdate = 0;
    let pinchStartDistance = 0;
    let pinchStartScale = 1;
    let zoomScale = 1;
    const sync = () => {
      setPlaying(!video.paused && !video.ended);
      setMuted(video.muted);
      setVolume(video.volume);
      setCurrentTime(video.currentTime || 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    };
    const syncProgress = () => {
      const now = performance.now();
      if (now - lastProgressUpdate < 250) return;
      lastProgressUpdate = now;
      setCurrentTime(video.currentTime || 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    };
    const onPlay = () => revealControls();
    const onPause = () => revealControls(true);
    const onVolume = () => {
      sync();
      try {
        localStorage.setItem("wiva-player-volume", String(video.volume));
      } catch {}
    };
    const onInteraction = () => revealControls();
    const onClick = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest("button, input, select, [role='menu']")) return;
      if (!canAutoHide()) {
        revealControls(true);
        return;
      }
      if (controlsVisibleRef.current && !video.paused) {
        clearHideTimer();
        controlsVisibleRef.current = false;
        setControlsVisible(false);
      } else revealControls();
    };
    const onDoubleClick = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest("button, input, select, [role='menu']")) return;
      event.preventDefault();
      toggleFullscreen();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === "Escape" && settingsOpen) {
        setSettingsOpen(false);
        settingsButtonRef.current?.focus();
        return;
      }
      const key = event.key.toLowerCase();
      if (key === " " || key === "k") {
        event.preventDefault();
        togglePlayback();
      } else if (key === "f") {
        event.preventDefault();
        toggleFullscreen();
      } else if (key === "m") {
        event.preventDefault();
        toggleMute();
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        changeVolume(Math.max(0, Math.min(1, video.volume + (event.key === "ArrowUp" ? 0.05 : -0.05))));
      } else if (!live && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
        event.preventDefault();
        video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + (event.key === "ArrowRight" ? 10 : -10)));
      }
      revealControls();
    };
    const onFullscreen = () => {
      const active = document.fullscreenElement === shell;
      setFullscreen(active);
      if (!active) {
        video.style.transform = "";
        setSettingsOpen(false);
      }
      revealControls(true);
    };
    const resetZoom = () => {
      zoomScale = 1;
      video.style.transform = "";
      setSettingsOpen(false);
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      pinchStartDistance = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY,
      );
      pinchStartScale = zoomScale;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !pinchStartDistance) return;
      event.preventDefault();
      const distance = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY,
      );
      zoomScale = Math.max(1, Math.min(2, pinchStartScale * (distance / pinchStartDistance)));
      video.style.transform = zoomScale === 1 ? "" : `scale(${zoomScale})`;
    };
    const onTouchEnd = () => {
      pinchStartDistance = 0;
      if (zoomScale < 1.03) resetZoom();
    };
    const onDocumentPointerDown = (event: PointerEvent) => {
      if (!settingsOpen) return;
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".wiva-player-settings-wrap")) {
        setSettingsOpen(false);
        settingsButtonRef.current?.focus();
      }
    };

    setPipAvailable(document.pictureInPictureEnabled && typeof video.requestPictureInPicture === "function");
    const events = ["play", "pause", "ended", "durationchange", "loadedmetadata"];
    events.forEach((event) => video.addEventListener(event, sync));
    video.addEventListener("timeupdate", syncProgress);
    video.addEventListener("loadedmetadata", resetZoom);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("volumechange", onVolume);
    shell.addEventListener("pointermove", onInteraction, { passive: true });
    shell.addEventListener("pointerdown", onInteraction, { passive: true });
    shell.addEventListener("click", onClick);
    shell.addEventListener("dblclick", onDoubleClick);
    shell.addEventListener("keydown", onKeyDown);
    video.addEventListener("touchstart", onTouchStart, { passive: true });
    video.addEventListener("touchmove", onTouchMove, { passive: false });
    video.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("pointerdown", onDocumentPointerDown);
    sync();
    revealControls(video.paused);

    return () => {
      clearHideTimer();
      events.forEach((event) => video.removeEventListener(event, sync));
      video.removeEventListener("timeupdate", syncProgress);
      video.removeEventListener("loadedmetadata", resetZoom);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("volumechange", onVolume);
      shell.removeEventListener("pointermove", onInteraction);
      shell.removeEventListener("pointerdown", onInteraction);
      shell.removeEventListener("click", onClick);
      shell.removeEventListener("dblclick", onDoubleClick);
      shell.removeEventListener("keydown", onKeyDown);
      video.removeEventListener("touchstart", onTouchStart);
      video.removeEventListener("touchmove", onTouchMove);
      video.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("pointerdown", onDocumentPointerDown);
    };
  }, [canAutoHide, changeVolume, clearHideTimer, live, revealControls, settingsOpen, toggleFullscreen, toggleMute, togglePlayback, videoRef]);

  return (
    <div
      className={`wiva-player-controls ${controlsVisible || settingsOpen ? "is-visible" : "is-hidden"}`}
      dir="rtl"
      onFocusCapture={() => revealControls(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) revealControls();
      }}
    >
      {!live && duration > 0 ? (
        <div className="wiva-player-progress">
          <input
            aria-label="موضع التشغيل"
            type="range"
            min="0"
            max={Math.max(duration, 1)}
            step="0.1"
            value={Math.min(currentTime, duration)}
            style={{ "--progress": `${(currentTime / duration) * 100}%` } as CSSProperties}
            onChange={(event) => {
              if (videoRef.current) videoRef.current.currentTime = Number(event.target.value);
            }}
          />
          <span dir="ltr">{formatTime(currentTime)} / {formatTime(duration)}</span>
        </div>
      ) : null}
      <div className="wiva-player-control-row">
        <div className="wiva-player-control-group">
          <button type="button" className="player-icon-btn" onClick={togglePlayback} title={playing ? "إيقاف مؤقت" : "تشغيل"} aria-label={playing ? "إيقاف الفيديو مؤقتًا" : "تشغيل الفيديو"}>
            {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          {live ? <span className="wiva-player-live"><i /> مباشر</span> : null}
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
        </div>
        <div className="wiva-player-control-group">
          {settings ? (
            <div className="wiva-player-settings-wrap">
              <button
                ref={settingsButtonRef}
                type="button"
                className="player-icon-btn"
                onClick={() => setSettingsOpen((value) => !value)}
                title="الإعدادات"
                aria-label="فتح إعدادات المشغل"
                aria-expanded={settingsOpen}
              >
                <Settings size={19} />
              </button>
              {settingsOpen ? <div className="wiva-player-settings" role="menu">{settings}</div> : null}
            </div>
          ) : null}
          {pipAvailable ? <button type="button" className="player-icon-btn player-pip-btn" onClick={togglePictureInPicture} title="صورة داخل صورة" aria-label="صورة داخل صورة"><PictureInPicture2 size={19} /></button> : null}
          <button type="button" className="player-icon-btn" onClick={toggleFullscreen} title={fullscreen ? "الخروج من ملء الشاشة" : "ملء الشاشة"} aria-label={fullscreen ? "الخروج من ملء الشاشة" : "الدخول إلى ملء الشاشة"}>
            {fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
          </button>
        </div>
      </div>
      {!playing ? (
        <button type="button" className="wiva-player-center-play" onClick={togglePlayback} aria-label="تشغيل الفيديو">
          <Play size={30} fill="currentColor" />
        </button>
      ) : null}
    </div>
  );
}
