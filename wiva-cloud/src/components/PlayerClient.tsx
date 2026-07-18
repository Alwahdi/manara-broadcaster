"use client";

import Hls, { ErrorTypes } from "hls.js";
import Link from "next/link";
import {
  AlertTriangle, FastForward, Gauge, LoaderCircle, LockKeyhole, Maximize, Minimize,
  LogIn, Pause, PictureInPicture2, Play, Radio, Rewind, RotateCcw, Settings, UserPlus, Volume2, VolumeX,
} from "lucide-react";
import { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";

type State = "idle" | "loading" | "ready" | "playing" | "paused" | "error" | "blocked" | "paywall";

type NetworkInfo = { effectiveType?: string; saveData?: boolean; downlink?: number };
type GestureFeedback = { kind: "seek-back" | "seek-forward" | "fullscreen" | "speed"; label: string } | null;
type LockableOrientation = { lock?: (orientation: "landscape") => Promise<void>; unlock?: () => void };

function playbackTuning() {
  const connection = (navigator as Navigator & { connection?: NetworkInfo }).connection;
  const constrained = connection?.saveData === true || /(^|-)2g$/.test(connection?.effectiveType || "") || (connection?.downlink || 10) < 1.5;
  return {
    liveStartBuffer: constrained ? 4.8 : 2.6,
    liveRecoveryBuffer: constrained ? 5.5 : 3.6,
    vodStartBuffer: constrained ? 2 : .9,
    liveSyncCount: constrained ? 4 : 3,
    bandwidthEstimate: constrained ? 850_000 : 3_500_000,
  };
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  const minutes = Math.floor(value / 60) % 60;
  const hours = Math.floor(value / 3600);
  return hours ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

export function PlayerClient({ assetId, title, active, resumeAt = 0, authenticated = false }: { assetId: string; title: string; active: boolean; resumeAt?: number; authenticated?: boolean }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startupCleanupRef = useRef<(() => void) | null>(null);
  const liveRecoveryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaseHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const leaseRef = useRef("");
  const gestureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const lastTouchTapRef = useRef<{ at: number; x: number } | null>(null);
  const touchGestureAtRef = useRef(0);
  const ignoreClickRef = useRef(false);
  const scrubbingRef = useRef(false);
  const [state, setState] = useState<State>(active ? "idle" : "blocked");
  const [message, setMessage] = useState("");
  const [live, setLive] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [buffering, setBuffering] = useState(false);
  const [gestureFeedback, setGestureFeedback] = useState<GestureFeedback>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const playing = state === "playing";

  const revealControls = useCallback((keep = false) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setControlsVisible(true);
    if (!keep) hideTimer.current = setTimeout(() => setControlsVisible(false), 3200);
  }, []);

  const stop = useCallback(() => {
    startupCleanupRef.current?.(); startupCleanupRef.current = null;
    if (liveRecoveryTimerRef.current) clearInterval(liveRecoveryTimerRef.current);
    liveRecoveryTimerRef.current = null;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = null;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
    if (bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current);
    bufferingTimerRef.current = null;
    if (leaseHeartbeatRef.current) clearInterval(leaseHeartbeatRef.current);
    leaseHeartbeatRef.current = null;
    const leaseId = leaseRef.current; leaseRef.current = "";
    if (leaseId) void fetch(`/api/playback/lease/${encodeURIComponent(leaseId)}`, { method: "DELETE", credentials: "include", keepalive: true }).catch(() => undefined);
    if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current);
    gestureTimerRef.current = null;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null; holdActiveRef.current = false;
    pointerStartRef.current = null; lastTouchTapRef.current = null; touchGestureAtRef.current = 0; ignoreClickRef.current = false; scrubbingRef.current = false;
    setGestureFeedback(null); setScrubbing(false);
    setBuffering(false);
    hlsRef.current?.destroy(); hlsRef.current = null;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const video = videoRef.current;
    if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
  }, []);

  const resume = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try { await video.play(); setState("playing"); setMessage(""); revealControls(); }
    catch { setState("ready"); setMessage("الفيديو جاهز. اضغط تشغيل للسماح به على هذا الجهاز."); revealControls(true); }
  }, [revealControls]);

  const play = useCallback(async () => {
    if (!active) return;
    stop(); setState("loading"); setMessage(""); setDuration(0); setCurrentTime(0); setBuffered(0);
    try {
      const response = await fetch(`/api/playback/${encodeURIComponent(assetId)}`, { cache: "no-store", credentials: "include" });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 402 || payload.action === "signup") {
          setState("paywall"); setMessage("أنشئ حسابًا لتبدأ 3 أيام مجانية، أو سجّل الدخول لمتابعة المشاهدة."); return;
        }
        throw new Error(response.status === 401 ? "سجّل الدخول لمتابعة المشاهدة." : response.status === 403 || response.status === 404 ? "هذا المحتوى غير متاح حاليًا." : "تعذر تشغيل الفيديو الآن. حاول بعد قليل.");
      }
      const video = videoRef.current;
      if (!video) return;
      const url = String(payload.url); const isLive = payload.live === true;
      if (payload.leaseId) {
        leaseRef.current = String(payload.leaseId);
        leaseHeartbeatRef.current = setInterval(() => {
          const currentLease = leaseRef.current;
          if (!currentLease) return;
          void fetch(`/api/playback/lease/${encodeURIComponent(currentLease)}`, { method: "PATCH", credentials: "include", keepalive: true })
            .then((heartbeat) => {
              if (heartbeat.ok) return;
              stop(); setState("error"); setMessage("توقف التشغيل لأن الحساب وصل إلى حد الأجهزة المسموح. اضغط تشغيل للمحاولة مجددًا.");
            }).catch(() => undefined);
        }, 30_000);
      }
      setLive(isLive);
      if (payload.preview === true && Number(payload.previewEndsAt) > Date.now()) {
        previewTimerRef.current = setTimeout(() => {
          stop(); setState("paywall"); setMessage("انتهت المعاينة المجانية. أنشئ حسابًا لتحصل على 3 أيام كاملة.");
        }, Number(payload.previewEndsAt) - Date.now());
      }
      if (isLive && Hls.isSupported()) {
        const tuning = playbackTuning();
        const hls = new Hls({
          enableWorker: true, lowLatencyMode: false, startFragPrefetch: true,
          liveSyncDurationCount: tuning.liveSyncCount, liveMaxLatencyDurationCount: tuning.liveSyncCount + 6,
          maxLiveSyncPlaybackRate: 1.02, maxBufferLength: 48, maxMaxBufferLength: 72, backBufferLength: 8,
          maxBufferHole: 1.2, highBufferWatchdogPeriod: 2, nudgeOffset: .12, nudgeMaxRetry: 6,
          fragLoadingMaxRetry: 10, manifestLoadingMaxRetry: 8,
          capLevelToPlayerSize: true, capLevelOnFPSDrop: true,
          abrEwmaDefaultEstimate: tuning.bandwidthEstimate, abrBandWidthFactor: .85, abrBandWidthUpFactor: .7,
        });
        hlsRef.current = hls; hls.loadSource(url); hls.attachMedia(video);
        let started = false; let networkRecoveries = 0; let mediaRecoveries = 0;
        const startWhenBuffered = () => {
          if (started || !video.buffered.length) return;
          const ahead = video.buffered.end(video.buffered.length - 1) - video.currentTime;
          if (ahead < tuning.liveStartBuffer) return;
          started = true; void resume();
        };
        const fallback = setTimeout(() => {
          if (!started && video.buffered.length && video.buffered.end(video.buffered.length - 1) - video.currentTime > 1.2) { started = true; void resume(); }
        }, 4_800);
        startupCleanupRef.current = () => clearTimeout(fallback);
        hls.on(Hls.Events.MANIFEST_PARSED, () => setMessage("لحظات ويبدأ البث…"));
        hls.on(Hls.Events.BUFFER_APPENDED, startWhenBuffered);
        hls.on(Hls.Events.FRAG_LOADED, () => { networkRecoveries = 0; startWhenBuffered(); });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (networkRecoveries < 4 && data.type === ErrorTypes.NETWORK_ERROR) {
            networkRecoveries += 1; setMessage("نعيد الاتصال…"); hls.stopLoad();
            setTimeout(() => hls.startLoad(-1), Math.min(2_400, 400 * 2 ** (networkRecoveries - 1))); return;
          }
          if (mediaRecoveries < 3 && data.type === ErrorTypes.MEDIA_ERROR) {
            mediaRecoveries += 1; setMessage("نعيد ضبط الصورة…");
            if (mediaRecoveries === 2) hls.swapAudioCodec(); hls.recoverMediaError(); return;
          }
          setMessage("تعذر استمرار البث الآن. حاول مرة أخرى."); setState("error"); hls.destroy();
        });
      } else {
        const tuning = playbackTuning();
        const media = video;
        media.src = url; media.preload = "auto"; setMessage("لحظات ويبدأ الفيديو…");
        let fallback: ReturnType<typeof setTimeout> | null = null;
        let started = false;
        const cleanup = () => {
          for (const event of ["progress", "canplay", "canplaythrough", "loadeddata"]) media.removeEventListener(event, startWhenReady);
          if (fallback) clearTimeout(fallback);
          if (startupCleanupRef.current === cleanup) startupCleanupRef.current = null;
        };
        const start = () => { if (started) return; started = true; cleanup(); void resume(); };
        function startWhenReady() {
          if (!media.buffered.length) return;
          const ahead = media.buffered.end(media.buffered.length - 1) - media.currentTime;
          if (ahead >= tuning.vodStartBuffer || media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) start();
        }
        startupCleanupRef.current = cleanup;
        for (const event of ["progress", "canplay", "canplaythrough", "loadeddata"]) media.addEventListener(event, startWhenReady);
        fallback = setTimeout(start, 3_500);
        media.load(); startWhenReady();
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تشغيل المحتوى"); setState("error"); }
  }, [active, assetId, resume, stop]);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void resume(); else video.pause();
  }, [resume]);

  const seekBy = useCallback((amount: number) => {
    const video = videoRef.current;
    if (!video || live || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + amount));
    revealControls(true);
  }, [live, revealControls]);

  const goLive = useCallback(() => {
    const video = videoRef.current;
    if (!video || !live) return;
    const hlsPosition = hlsRef.current?.liveSyncPosition;
    if (typeof hlsPosition === "number" && Number.isFinite(hlsPosition)) video.currentTime = hlsPosition;
    else if (video.seekable.length) video.currentTime = Math.max(0, video.seekable.end(video.seekable.length - 1) - .35);
    void resume(); revealControls();
  }, [live, resume, revealControls]);

  const showGesture = useCallback((feedback: NonNullable<GestureFeedback>) => {
    if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current);
    setGestureFeedback(feedback);
    gestureTimerRef.current = setTimeout(() => setGestureFeedback(null), 850);
  }, []);

  const setLandscape = useCallback(async (lock: boolean) => {
    const orientation = screen.orientation as unknown as LockableOrientation | undefined;
    try { if (lock) await orientation?.lock?.("landscape"); else orientation?.unlock?.(); } catch {}
  }, []);

  const enterFullscreen = useCallback(async (landscape = false) => {
    const shell = shellRef.current; const video = videoRef.current;
    if (!shell || !video) return;
    try {
      if (shell.requestFullscreen) await shell.requestFullscreen();
      else (video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.();
      if (landscape) await setLandscape(true);
    } catch {}
  }, [setLandscape]);

  const exitFullscreen = useCallback(async () => {
    const video = videoRef.current as HTMLVideoElement & { webkitExitFullscreen?: () => void };
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else video?.webkitExitFullscreen?.();
    } catch {}
    await setLandscape(false);
  }, [setLandscape]);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement || fullscreen) await exitFullscreen();
    else await enterFullscreen(window.matchMedia("(pointer: coarse)").matches);
  }, [enterFullscreen, exitFullscreen, fullscreen]);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled || typeof video.requestPictureInPicture !== "function") return;
    try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await video.requestPictureInPicture(); } catch {}
  }, []);

  const handleVideoClick = useCallback(() => {
    if (ignoreClickRef.current) { ignoreClickRef.current = false; return; }
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      if (window.matchMedia("(pointer: coarse)").matches) {
        if (controlsVisible) { if (playing) setControlsVisible(false); }
        else revealControls(true);
      } else togglePlayback();
    }, 260);
  }, [controlsVisible, playing, revealControls, togglePlayback]);

  const handleTouchDoubleTap = useCallback((clientX: number) => {
    const video = videoRef.current;
    if (!video) return;
    const bounds = video.getBoundingClientRect();
    const position = (clientX - bounds.left) / Math.max(1, bounds.width);
    if (!live && (position <= .42 || position >= .58)) {
      const amount = position >= .58 ? 10 : -10;
      seekBy(amount);
      showGesture({ kind: amount > 0 ? "seek-forward" : "seek-back", label: amount > 0 ? "+10 ثوانٍ" : "−10 ثوانٍ" });
    } else revealControls(true);
  }, [live, revealControls, seekBy, showGesture]);

  const handleVideoDoubleClick = useCallback((event: ReactMouseEvent<HTMLVideoElement>) => {
    event.preventDefault();
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (coarse) { if (Date.now() - touchGestureAtRef.current > 500) handleTouchDoubleTap(event.clientX); return; }
    const entering = !document.fullscreenElement;
    void toggleFullscreen();
    showGesture({ kind: "fullscreen", label: entering ? "ملء الشاشة" : "العودة للحجم الطبيعي" });
  }, [handleTouchDoubleTap, showGesture, toggleFullscreen]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    revealControls(!playing);
    if (event.pointerType !== "touch" || (event.target as HTMLElement).closest("button,input,a")) return;
    pointerStartRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    if (!live && playing) {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      holdTimerRef.current = setTimeout(() => {
        const video = videoRef.current;
        if (!video || video.paused) return;
        holdActiveRef.current = true; ignoreClickRef.current = true; video.playbackRate = 2;
        showGesture({ kind: "speed", label: "سرعة 2×" });
      }, 430);
    }
  }, [live, playing, revealControls, showGesture]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    revealControls(!playing);
    const start = pointerStartRef.current;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 18 && holdTimerRef.current && !holdActiveRef.current) {
      clearTimeout(holdTimerRef.current); holdTimerRef.current = null;
    }
  }, [playing, revealControls]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    if (holdActiveRef.current) {
      holdActiveRef.current = false; pointerStartRef.current = null; ignoreClickRef.current = true;
      const video = videoRef.current; if (video) video.playbackRate = speed;
      setGestureFeedback(null); revealControls(); return;
    }
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x; const dy = event.clientY - start.y;
    if (Math.abs(dy) < 54 || Math.abs(dy) < Math.abs(dx) * 1.25) {
      if (event.pointerType === "touch" && Math.hypot(dx, dy) < 22) {
        const now = Date.now(); const previous = lastTouchTapRef.current;
        if (previous && now - previous.at < 340 && Math.abs(previous.x - event.clientX) < 54) {
          lastTouchTapRef.current = null; touchGestureAtRef.current = now; ignoreClickRef.current = true;
          if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null; handleTouchDoubleTap(event.clientX);
        } else lastTouchTapRef.current = { at: now, x: event.clientX };
      }
      return;
    }
    lastTouchTapRef.current = null;
    ignoreClickRef.current = true;
    if (dy < 0 && !fullscreen) {
      void enterFullscreen(true);
      showGesture({ kind: "fullscreen", label: "ملء الشاشة" });
    } else if (dy > 0 && fullscreen) {
      void exitFullscreen();
      showGesture({ kind: "fullscreen", label: "العودة للحجم الطبيعي" });
    }
  }, [enterFullscreen, exitFullscreen, fullscreen, handleTouchDoubleTap, revealControls, showGesture, speed]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: "WIVA" });
    const video = videoRef.current;
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler | null]> = [
      ["play", () => void resume()], ["pause", () => video?.pause()],
      ["seekbackward", live ? null : () => seekBy(-10)], ["seekforward", live ? null : () => seekBy(10)],
    ];
    for (const [action, handler] of handlers) { try { navigator.mediaSession.setActionHandler(action, handler); } catch {} }
    return () => { for (const [action] of handlers) { try { navigator.mediaSession.setActionHandler(action, null); } catch {} } };
  }, [live, resume, seekBy, title]);

  useEffect(() => {
    const video = videoRef.current; const shell = shellRef.current;
    if (!video || !shell) return;
    try { const saved = Number(localStorage.getItem("wiva-cloud-volume")); if (saved >= 0 && saved <= 1) video.volume = saved; } catch {}
    let lastSavedAt = 0; let lastCloudSavedAt = 0;
    const saveCloudProgress = (completed = false) => {
      if (!authenticated || live || !Number.isFinite(video.duration) || video.duration <= 0) return;
      void fetch(`/api/viewer/activity/${encodeURIComponent(assetId)}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, credentials: "include", keepalive: true,
        body: JSON.stringify({ positionSeconds: completed ? video.duration : video.currentTime, durationSeconds: video.duration, completed }),
      }).catch(() => undefined);
    };
    const sync = () => {
      setCurrentTime(video.currentTime || 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setVolume(video.volume); setMuted(video.muted);
      if (video.buffered.length && Number.isFinite(video.duration) && video.duration > 0) setBuffered((video.buffered.end(video.buffered.length - 1) / video.duration) * 100);
      if (!live && performance.now() - lastSavedAt > 3000 && video.currentTime > 5 && video.duration > 0) {
        lastSavedAt = performance.now();
        try { localStorage.setItem(`wiva-progress:${assetId}`, String(video.currentTime)); } catch {}
        if (authenticated && performance.now() - lastCloudSavedAt > 12_000) { lastCloudSavedAt = performance.now(); saveCloudProgress(); }
      }
    };
    const restoreProgress = () => {
      if (live || !Number.isFinite(video.duration)) return;
      try {
        const saved = Math.max(resumeAt, Number(localStorage.getItem(`wiva-progress:${assetId}`)) || 0);
        if (saved > 5 && saved < video.duration * 0.95) video.currentTime = saved;
      } catch {}
    };
    const clearBuffering = () => {
      if (bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current);
      bufferingTimerRef.current = null; setBuffering(false);
    };
    const onPlaying = () => { clearBuffering(); setState("playing"); setMessage(""); revealControls(); };
    const onPause = () => setState((value) => value === "playing" ? "paused" : value);
    const recoverLivePlayback = () => {
      if (!live || !video.buffered.length) return;
      const lastRange = video.buffered.length - 1;
      const rangeStart = video.buffered.start(lastRange);
      const gap = rangeStart - video.currentTime;
      if (gap > .12 && gap < 2.5) video.currentTime = rangeStart + .06;
      const ahead = video.buffered.end(lastRange) - video.currentTime;
      if (ahead < playbackTuning().liveRecoveryBuffer || video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return;
      if (liveRecoveryTimerRef.current) clearInterval(liveRecoveryTimerRef.current);
      liveRecoveryTimerRef.current = null;
      // A waiting event does not mean the user paused. Keep the player visible
      // and let the existing user gesture continue playback as soon as MSE has
      // enough forward data (Samsung/Android may not emit another progress event).
      if (!video.paused) { setState("playing"); setMessage(""); return; }
      void video.play().then(() => { setState("playing"); setMessage(""); }).catch(() => setState("ready"));
    };
    const onWaiting = () => {
      if (bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current);
      bufferingTimerRef.current = setTimeout(() => setBuffering(true), 320);
      if (live) {
        setMessage("لحظات ويعود البث…");
        recoverLivePlayback();
        if (!liveRecoveryTimerRef.current) liveRecoveryTimerRef.current = setInterval(recoverLivePlayback, 450);
      } else setMessage("جارٍ الانتقال إلى الموضع المطلوب…");
    };
    const onCanPlay = () => { clearBuffering(); if (live) recoverLivePlayback(); else setMessage(""); };
    const onEnded = () => { setState("paused"); saveCloudProgress(true); try { localStorage.removeItem(`wiva-progress:${assetId}`); } catch {} };
    const onMediaError = () => { setState("error"); setMessage("تعذر تشغيل الفيديو الآن. جرّب مرة أخرى."); };
    const onVolume = () => { sync(); try { localStorage.setItem("wiva-cloud-volume", String(video.volume)); } catch {} };
    const onFullscreen = () => {
      const activeFullscreen = document.fullscreenElement === shell;
      setFullscreen(activeFullscreen);
      if (!activeFullscreen) void setLandscape(false);
    };
    const onWebkitBeginFullscreen = () => setFullscreen(true);
    const onWebkitEndFullscreen = () => { setFullscreen(false); void setLandscape(false); };
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest("input,button,select,textarea")) return;
      const key = event.key.toLowerCase();
      if (key === " " || key === "k") { event.preventDefault(); togglePlayback(); }
      else if (key === "f") { event.preventDefault(); void toggleFullscreen(); }
      else if (key === "m") { event.preventDefault(); video.muted = !video.muted; }
      else if (!live && key === "l") { event.preventDefault(); seekBy(10); }
      else if (!live && key === "j") { event.preventDefault(); seekBy(-10); }
      else if (!live && event.key === "ArrowRight") { event.preventDefault(); seekBy(5); }
      else if (!live && event.key === "ArrowLeft") { event.preventDefault(); seekBy(-5); }
      else if (event.key === "ArrowUp") { event.preventDefault(); video.muted = false; video.volume = Math.min(1, video.volume + .05); }
      else if (event.key === "ArrowDown") { event.preventDefault(); video.volume = Math.max(0, video.volume - .05); }
      else if (!live && /^[0-9]$/.test(event.key) && Number.isFinite(video.duration)) { event.preventDefault(); video.currentTime = video.duration * Number(event.key) / 10; }
      else if (!live && (event.key === ">" || event.key === "." && event.shiftKey)) { event.preventDefault(); const next = Math.min(2, video.playbackRate + .25); video.playbackRate = next; setSpeed(next); }
      else if (!live && (event.key === "<" || event.key === "," && event.shiftKey)) { event.preventDefault(); const next = Math.max(.5, video.playbackRate - .25); video.playbackRate = next; setSpeed(next); }
      revealControls();
    };
    for (const name of ["timeupdate", "durationchange", "loadedmetadata", "progress", "seeking", "seeked"]) video.addEventListener(name, sync);
    video.addEventListener("progress", recoverLivePlayback);
    video.addEventListener("loadedmetadata", restoreProgress); video.addEventListener("playing", onPlaying); video.addEventListener("pause", onPause); video.addEventListener("waiting", onWaiting); video.addEventListener("stalled", onWaiting); video.addEventListener("canplay", onCanPlay); video.addEventListener("ended", onEnded); video.addEventListener("error", onMediaError); video.addEventListener("volumechange", onVolume);
    document.addEventListener("fullscreenchange", onFullscreen); video.addEventListener("webkitbeginfullscreen", onWebkitBeginFullscreen); video.addEventListener("webkitendfullscreen", onWebkitEndFullscreen); shell.addEventListener("keydown", onKey);
    return () => {
      if (!live && video.currentTime > 5 && video.duration > 0) saveCloudProgress();
      for (const name of ["timeupdate", "durationchange", "loadedmetadata", "progress", "seeking", "seeked"]) video.removeEventListener(name, sync);
      video.removeEventListener("progress", recoverLivePlayback);
      if (liveRecoveryTimerRef.current) clearInterval(liveRecoveryTimerRef.current);
      liveRecoveryTimerRef.current = null;
      if (bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current);
      bufferingTimerRef.current = null;
      video.removeEventListener("loadedmetadata", restoreProgress); video.removeEventListener("playing", onPlaying); video.removeEventListener("pause", onPause); video.removeEventListener("waiting", onWaiting); video.removeEventListener("stalled", onWaiting); video.removeEventListener("canplay", onCanPlay); video.removeEventListener("ended", onEnded); video.removeEventListener("error", onMediaError); video.removeEventListener("volumechange", onVolume);
      document.removeEventListener("fullscreenchange", onFullscreen); video.removeEventListener("webkitbeginfullscreen", onWebkitBeginFullscreen); video.removeEventListener("webkitendfullscreen", onWebkitEndFullscreen); shell.removeEventListener("keydown", onKey);
    };
  }, [assetId, authenticated, live, resumeAt, revealControls, seekBy, setLandscape, toggleFullscreen, togglePlayback]);

  useEffect(() => () => stop(), [stop]);

  const showStartup = ["idle", "loading", "ready", "error", "blocked", "paywall"].includes(state);
  const displayedTime = scrubbing ? scrubTime : currentTime;
  const progress = duration > 0 ? Math.min(100, (displayedTime / duration) * 100) : 0;

  return (
    <div ref={shellRef} className={`player-stage wiva-cloud-player ${controlsVisible ? "controls-visible" : "controls-hidden"} ${scrubbing ? "is-scrubbing" : ""}`} tabIndex={0} aria-label={`مشغل ${title}`} aria-busy={state === "loading" || buffering} onPointerMove={handlePointerMove} onPointerLeave={() => { if (playing) setControlsVisible(false); }} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={() => { if (holdTimerRef.current) clearTimeout(holdTimerRef.current); holdTimerRef.current = null; if (holdActiveRef.current && videoRef.current) videoRef.current.playbackRate = speed; holdActiveRef.current = false; pointerStartRef.current = null; }}>
      <video ref={videoRef} playsInline disablePictureInPicture={false} controlsList="nodownload" aria-label={title} onClick={handleVideoClick} onDoubleClick={handleVideoDoubleClick} />
      {showStartup ? <div className="player-overlay">
        {state === "loading" ? <div className="player-startup-loading" role="status"><span className="player-spinner"><LoaderCircle /></span><small className="sr-only">{message || "جارٍ تجهيز التشغيل"}</small></div> : <>
          {state === "paywall" || state === "blocked" ? <LockKeyhole size={38} /> : state === "error" ? <AlertTriangle size={38} /> : <Play size={44} fill="currentColor" />}
          <h2>{state === "paywall" ? "تابع المشاهدة" : state === "blocked" ? "المحتوى غير متاح" : state === "error" ? "تعذر بدء التشغيل" : state === "ready" ? "الفيديو جاهز" : "جاهز للمشاهدة"}</h2>
          <p>{message || (state === "blocked" ? "هذا المحتوى غير متاح حاليًا." : "اضغط تشغيل وابدأ المشاهدة.")}</p>
          {state === "paywall" ? <div className="player-paywall-actions"><Link className="button primary" href="/signup"><UserPlus size={18} /> ابدأ 3 أيام مجانًا</Link><Link className="button secondary" href="/login"><LogIn size={18} /> تسجيل الدخول</Link></div> : active ? <button className="button primary player-start" onClick={state === "ready" ? resume : play}>{state === "error" ? <RotateCcw size={19} /> : <Play size={19} />} {state === "error" ? "إعادة المحاولة" : "تشغيل الآن"}</button> : null}
        </>}
      </div> : null}

      {!showStartup && buffering ? <div className="player-buffering" role="status" aria-live="polite"><span className="player-spinner"><LoaderCircle /></span><span className="sr-only">{message || "لحظات ونكمل المشاهدة"}</span></div> : null}
      {gestureFeedback ? <div className={`player-gesture-feedback ${gestureFeedback.kind}`} aria-live="polite">{gestureFeedback.kind === "seek-forward" ? <FastForward /> : gestureFeedback.kind === "seek-back" ? <Rewind /> : gestureFeedback.kind === "speed" ? <Gauge /> : <Maximize />}<strong>{gestureFeedback.label}</strong></div> : null}

      {!showStartup ? <div className="wiva-cloud-controls" dir="rtl">
        <div className="player-mobile-title"><strong>{title}</strong><span>{live ? "مباشر · اسحب للأعلى لملء الشاشة" : "نقرتان ±10 ثوانٍ · اضغط مطولًا لسرعة 2×"}</span></div>
        {!live && duration > 0 ? <div className="wiva-cloud-timeline">
          {scrubbing ? <output className="player-scrub-preview" style={{ "--scrub-position": `${progress}%` } as CSSProperties}>{formatTime(scrubTime)}</output> : null}
          <input aria-label="موضع الفيلم" type="range" min="0" max={duration} step="0.1" value={Math.min(displayedTime, duration)} style={{ "--played": `${progress}%`, "--buffered": `${Math.max(progress, buffered)}%` } as CSSProperties}
            onPointerDown={(event) => { event.stopPropagation(); scrubbingRef.current = true; setScrubbing(true); setScrubTime(Number(event.currentTarget.value)); revealControls(true); }}
            onChange={(event) => { const next = Number(event.target.value); setScrubTime(next); if (!scrubbingRef.current && videoRef.current) { videoRef.current.currentTime = next; setCurrentTime(next); } }}
            onPointerUp={(event) => { event.stopPropagation(); const next = Number(event.currentTarget.value); if (videoRef.current) videoRef.current.currentTime = next; setCurrentTime(next); scrubbingRef.current = false; setScrubbing(false); revealControls(); }}
            onPointerCancel={() => { scrubbingRef.current = false; setScrubbing(false); }}
            onKeyUp={(event) => { if (videoRef.current) videoRef.current.currentTime = Number(event.currentTarget.value); }} />
          <span dir="ltr">{formatTime(displayedTime)} / {formatTime(duration)}</span>
        </div> : null}
        <div className="wiva-cloud-control-row">
          <div className="wiva-cloud-control-group">
            <button className="player-control-button primary-control" onClick={togglePlayback} aria-label={playing ? "إيقاف مؤقت" : "تشغيل"}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button>
            {!live ? <><button className="player-control-button seek-control" onClick={() => seekBy(-10)} aria-label="رجوع عشر ثوان" title="رجوع 10 ثوانٍ (J)"><Rewind /><small>10</small></button><button className="player-control-button seek-control" onClick={() => seekBy(10)} aria-label="تقديم عشر ثوان" title="تقديم 10 ثوانٍ (L)"><FastForward /><small>10</small></button></> : <button className="player-live-badge" onClick={goLive} aria-label="العودة إلى اللحظة المباشرة" title="العودة إلى البث المباشر"><i /><Radio size={15} /> مباشر</button>}
            <button className="player-control-button" onClick={() => { const video = videoRef.current; if (video) video.muted = !video.muted; }} aria-label={muted ? "تشغيل الصوت" : "كتم الصوت"}>{muted || volume === 0 ? <VolumeX /> : <Volume2 />}</button>
            <input className="player-volume" aria-label="مستوى الصوت" type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={(event) => { const video = videoRef.current; if (video) { video.volume = Number(event.target.value); video.muted = false; } }} />
          </div>
          <div className="wiva-cloud-control-group">
            <div className="player-settings-wrap"><button className="player-control-button" onClick={() => setSettingsOpen((value) => !value)} aria-label="إعدادات المشغل" aria-expanded={settingsOpen} aria-controls="player-settings"><Settings /></button>
              {settingsOpen ? <div className="player-settings-menu" id="player-settings" role="dialog" aria-label="إعدادات التشغيل"><strong><Gauge size={16} /> سرعة التشغيل</strong>{live ? <p>يضبط المشغل البث تلقائيًا</p> : <div>{[0.75, 1, 1.25, 1.5, 2].map((value) => <button key={value} className={speed === value ? "active" : ""} aria-pressed={speed === value} onClick={() => { const video = videoRef.current; if (video) video.playbackRate = value; setSpeed(value); setSettingsOpen(false); }}>{value === 1 ? "عادي" : `${value}×`}</button>)}</div>}<small>الجودة تلقائية حسب سرعة الاتصال</small></div> : null}
            </div>
            <button className="player-control-button pip-control" onClick={() => void togglePip()} aria-label="صورة داخل صورة"><PictureInPicture2 /></button>
            <button className="player-control-button" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? "الخروج من ملء الشاشة" : "ملء الشاشة"}>{fullscreen ? <Minimize /> : <Maximize />}</button>
          </div>
        </div>
        {!playing ? <button className="player-center-button" onClick={togglePlayback} aria-label="تشغيل"><Play fill="currentColor" /></button> : null}
      </div> : null}
    </div>
  );
}
