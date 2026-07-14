import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import {
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCw,
  Settings,
  Volume2,
  VolumeX,
} from "lucide-react";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  live?: boolean;
  settings?: ReactNode;
};

type PlayerRotation = 0 | 90 | 180 | 270;

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape" | "portrait") => Promise<void>;
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
  const [rotation, setRotation] = useState<PlayerRotation>(0);
  const [pipAvailable, setPipAvailable] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState<"forward" | "back" | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const controlsVisibleRef = useRef(true);
  const audioInitializedRef = useRef(false);
  const orientationLockedRef = useRef(false);

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

  const applyRotation = useCallback((next: PlayerRotation) => {
    const shell = getPlayerShell(videoRef.current);
    if (!shell) return;
    shell.dataset.rotation = String(next);
    shell.style.setProperty("--wiva-video-rotation", `${next}deg`);
    setRotation(next);
  }, [videoRef]);

  const unlockOrientation = useCallback(() => {
    if (!orientationLockedRef.current) return;
    try { window.screen.orientation?.unlock?.(); } catch {}
    orientationLockedRef.current = false;
  }, []);

  const exitPseudoFullscreen = useCallback((shell: HTMLElement) => {
    shell.classList.remove("is-pseudo-fullscreen");
    document.body.classList.remove("wiva-player-fullscreen-open");
    setFullscreen(false);
    applyRotation(0);
    unlockOrientation();
  }, [applyRotation, unlockOrientation]);

  const enterFullscreen = useCallback(async (autoRotate = true) => {
    const video = videoRef.current;
    const shell = getPlayerShell(video);
    if (!video || !shell) return;
    let nativeFullscreen = false;
    try {
      if (shell.requestFullscreen) {
        await shell.requestFullscreen();
        nativeFullscreen = true;
      }
    } catch {}
    if (!nativeFullscreen) {
      shell.classList.add("is-pseudo-fullscreen");
      document.body.classList.add("wiva-player-fullscreen-open");
      setFullscreen(true);
    }
    const mobilePortrait = window.innerWidth <= 900 && window.matchMedia("(orientation: portrait)").matches;
    const landscapeVideo = !video.videoWidth || !video.videoHeight || video.videoWidth >= video.videoHeight;
    if (!autoRotate || !mobilePortrait || !landscapeVideo) return;
    const orientation = window.screen.orientation as LockableScreenOrientation | undefined;
    try {
      if (orientation?.lock) {
        await orientation.lock("landscape");
        orientationLockedRef.current = true;
        return;
      }
    } catch {}
    applyRotation(90);
  }, [applyRotation, videoRef]);

  const toggleFullscreen = useCallback(async () => {
    const video = videoRef.current;
    const shell = getPlayerShell(video);
    if (!video || !shell) return;
    try {
      if (shell.classList.contains("is-pseudo-fullscreen")) exitPseudoFullscreen(shell);
      else if (document.fullscreenElement) await document.exitFullscreen();
      else await enterFullscreen(true);
    } catch {}
  }, [enterFullscreen, exitPseudoFullscreen, videoRef]);

  const toggleRotation = useCallback(async () => {
    const video = videoRef.current;
    const shell = getPlayerShell(video);
    if (!video || !shell) return;
    if (!document.fullscreenElement && !shell.classList.contains("is-pseudo-fullscreen")) {
      await enterFullscreen(false);
    }
    unlockOrientation();
    const next = (rotation === 270 ? 0 : rotation + 90) as PlayerRotation;
    applyRotation(next);
    revealControls(true);
  }, [applyRotation, enterFullscreen, revealControls, rotation, unlockOrientation, videoRef]);

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
    let lastTapAt = 0;
    let lastTapSide = 0;
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
      if (!active && !shell.classList.contains("is-pseudo-fullscreen")) {
        applyRotation(0);
        video.style.removeProperty("--wiva-video-scale");
        unlockOrientation();
        setSettingsOpen(false);
      }
      revealControls(true);
    };
    const resetZoom = () => {
      zoomScale = 1;
      video.style.removeProperty("--wiva-video-scale");
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
      video.style.setProperty("--wiva-video-scale", String(zoomScale));
    };
    const onTouchEnd = (event: TouchEvent) => {
      const wasPinching = pinchStartDistance > 0;
      pinchStartDistance = 0;
      if (zoomScale < 1.03) resetZoom();
      if (wasPinching || live || event.changedTouches.length !== 1) return;
      const rect = shell.getBoundingClientRect();
      const side = event.changedTouches[0].clientX < rect.left + (rect.width / 2) ? -1 : 1;
      const now = Date.now();
      if (now - lastTapAt <= 350 && side === lastTapSide && Number.isFinite(video.duration)) {
        video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + (side * 10)));
        setSeekFeedback(side > 0 ? "forward" : "back");
        if (seekFeedbackTimer.current) clearTimeout(seekFeedbackTimer.current);
        seekFeedbackTimer.current = setTimeout(() => setSeekFeedback(null), 700);
        lastTapAt = 0;
        return;
      }
      lastTapAt = now;
      lastTapSide = side;
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
      if (seekFeedbackTimer.current) clearTimeout(seekFeedbackTimer.current);
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
  }, [applyRotation, canAutoHide, changeVolume, clearHideTimer, live, revealControls, settingsOpen, toggleFullscreen, toggleMute, togglePlayback, unlockOrientation, videoRef]);

  useEffect(() => () => {
    const shell = getPlayerShell(videoRef.current);
    shell?.classList.remove("is-pseudo-fullscreen");
    document.body.classList.remove("wiva-player-fullscreen-open");
    unlockOrientation();
  }, [unlockOrientation, videoRef]);

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
          <button type="button" className="player-icon-btn player-rotate-btn" onClick={toggleRotation} title="تدوير الفيديو" aria-label={`تدوير الفيديو، الزاوية الحالية ${rotation} درجة`}>
            <RotateCw size={19} />
          </button>
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
      {seekFeedback ? (
        <div className={`wiva-player-seek-feedback ${seekFeedback}`} aria-live="polite">
          {seekFeedback === "forward" ? "+10" : "-10"}
        </div>
      ) : null}
    </div>
  );
}
