import { useEffect, useRef, useState, useCallback } from "react";
import Hls, { type Level } from "hls.js";

export type PlayerStatus = "idle" | "connecting" | "playing" | "paused" | "error" | "manual";

export function useHlsPlayer(streamUrl: string) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("جاري الاتصال...");
  const [levels, setLevels] = useState<Level[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1); // -1 = auto
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  const cleanup = useCallback(() => {
    if (retryRef.current) clearTimeout(retryRef.current);
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
  }, []);

  const load = useCallback(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    cleanup();
    setStatus("connecting");
    setStatusMessage("جاري تجهيز البث...");

    const tryPlay = () => {
      video.play().catch(() => {
        video.muted = true;
        setIsMuted(true);
        video.play().then(() => {
          setStatus("playing");
        }).catch(() => {
          setStatus("manual");
          setStatusMessage("اضغط لتشغيل البث");
        });
      });
    };

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
      video.addEventListener("loadedmetadata", tryPlay, { once: true });
      return;
    }

    if (!Hls.isSupported()) {
      setStatus("error");
      setStatusMessage("المتصفح لا يدعم تشغيل HLS");
      return;
    }

    const hls = new Hls({ liveSyncDuration: 8, enableWorker: true });
    hlsRef.current = hls;
    hls.loadSource(streamUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      setLevels(hls.levels);
      tryPlay();
    });

    hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
      setCurrentLevel(hls.autoLevelEnabled ? -1 : data.level);
    });

    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls.startLoad();
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
      } else {
        setStatus("error");
        setStatusMessage("حدث خطأ في البث. سيتم إعادة المحاولة...");
        retryCountRef.current += 1;
        if (retryCountRef.current < 5) {
          retryRef.current = setTimeout(load, Math.min(3000 * retryCountRef.current, 15000));
        }
      }
    });
  }, [streamUrl, cleanup]);

  // Bind video events
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlaying = () => { setStatus("playing"); retryCountRef.current = 0; };
    const onPause = () => setStatus((s) => (s === "playing" ? "paused" : s));
    const onWaiting = () => setStatusMessage("جاري التخزين المؤقت...");
    v.addEventListener("playing", onPlaying);
    v.addEventListener("pause", onPause);
    v.addEventListener("waiting", onWaiting);
    return () => {
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("waiting", onWaiting);
    };
  }, []);

  useEffect(() => {
    load();
    return cleanup;
  }, [load, cleanup]);

  // Wake lock
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible" && status === "playing") {
          lock = await (navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<WakeLockSentinel> } }).wakeLock.request("screen");
        }
      } catch { /* ignore */ }
    };
    acquire();
    const onVis = () => { if (document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => {});
    };
  }, [status]);

  const setQuality = useCallback((level: number) => {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = level;
    setCurrentLevel(level);
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  }, []);

  const changeVolume = useCallback((val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    setVolume(val);
    if (val > 0 && v.muted) {
      v.muted = false;
      setIsMuted(false);
    }
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const requestPiP = useCallback(async () => {
    const v = videoRef.current as HTMLVideoElement & { requestPictureInPicture?: () => Promise<PictureInPictureWindow> };
    if (!v?.requestPictureInPicture) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await v.requestPictureInPicture();
      }
    } catch { /* ignore */ }
  }, []);

  const reload = useCallback(() => {
    retryCountRef.current = 0;
    load();
  }, [load]);

  return {
    videoRef,
    status,
    statusMessage,
    levels,
    currentLevel,
    isMuted,
    volume,
    setQuality,
    toggleMute,
    changeVolume,
    togglePlay,
    requestPiP,
    reload,
  };
}
