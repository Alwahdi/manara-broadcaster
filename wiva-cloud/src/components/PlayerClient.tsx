"use client";

import Hls, { ErrorTypes } from "hls.js";
import {
  AlertTriangle, FastForward, Gauge, LoaderCircle, LockKeyhole, Maximize, Minimize,
  LogIn, Pause, PictureInPicture2, Play, Radio, Rewind, RotateCcw, Settings, UserPlus, Volume2, VolumeX,
} from "lucide-react";
import { CSSProperties, MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef, useState } from "react";

type State = "idle" | "loading" | "ready" | "playing" | "paused" | "error" | "blocked" | "paywall";

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  const minutes = Math.floor(value / 60) % 60;
  const hours = Math.floor(value / 3600);
  return hours ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

export function PlayerClient({ assetId, title, active }: { assetId: string; title: string; active: boolean }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startupCleanupRef = useRef<(() => void) | null>(null);
  const liveRecoveryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [gestureHint, setGestureHint] = useState("");

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
    if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current);
    gestureTimerRef.current = null;
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
      setLive(isLive);
      if (payload.preview === true && Number(payload.previewEndsAt) > Date.now()) {
        previewTimerRef.current = setTimeout(() => {
          stop(); setState("paywall"); setMessage("انتهت المعاينة المجانية. أنشئ حسابًا لتحصل على 3 أيام كاملة.");
        }, Number(payload.previewEndsAt) - Date.now());
      }
      if (isLive && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: false, startFragPrefetch: true, liveSyncDurationCount: 4, liveMaxLatencyDurationCount: 12, maxLiveSyncPlaybackRate: 1.05, maxBufferLength: 45, maxMaxBufferLength: 90, backBufferLength: 30, fragLoadingMaxRetry: 10, manifestLoadingMaxRetry: 6 });
        hlsRef.current = hls; hls.loadSource(url); hls.attachMedia(video);
        let started = false; let recoveryAttempts = 0;
        const startWhenBuffered = () => {
          if (started || !video.buffered.length) return;
          const ahead = video.buffered.end(video.buffered.length - 1) - video.currentTime;
          if (ahead < 5) return;
          started = true; void resume();
        };
        hls.on(Hls.Events.MANIFEST_PARSED, () => setMessage("لحظات ويبدأ البث…"));
        hls.on(Hls.Events.BUFFER_APPENDED, startWhenBuffered);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (recoveryAttempts < 2 && data.type === ErrorTypes.NETWORK_ERROR) { recoveryAttempts += 1; setMessage("نعيد الاتصال…"); setTimeout(() => hls.startLoad(), 600 * recoveryAttempts); return; }
          if (recoveryAttempts < 2 && data.type === ErrorTypes.MEDIA_ERROR) { recoveryAttempts += 1; setMessage("نعيد ضبط الصورة…"); hls.recoverMediaError(); return; }
          setMessage("تعذر استمرار البث الآن. حاول مرة أخرى."); setState("error"); hls.destroy();
        });
      } else {
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
          if (ahead >= 2.5 || media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) start();
        }
        startupCleanupRef.current = cleanup;
        for (const event of ["progress", "canplay", "canplaythrough", "loadeddata"]) media.addEventListener(event, startWhenReady);
        fallback = setTimeout(start, 5_000);
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

  const toggleFullscreen = useCallback(async () => {
    const shell = shellRef.current; const video = videoRef.current;
    if (!shell || !video) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (shell.requestFullscreen) await shell.requestFullscreen();
      else (video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.();
    } catch {}
  }, []);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled || typeof video.requestPictureInPicture !== "function") return;
    try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await video.requestPictureInPicture(); } catch {}
  }, []);

  const handleVideoClick = useCallback(() => {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => { clickTimerRef.current = null; togglePlayback(); }, 220);
  }, [togglePlayback]);

  const handleVideoDoubleClick = useCallback((event: ReactMouseEvent<HTMLVideoElement>) => {
    event.preventDefault();
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
    const entering = !document.fullscreenElement;
    void toggleFullscreen();
    setGestureHint(entering ? "ملء الشاشة" : "العودة للحجم الطبيعي");
    if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current);
    gestureTimerRef.current = setTimeout(() => setGestureHint(""), 1200);
  }, [toggleFullscreen]);

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
    let lastSavedAt = 0;
    const sync = () => {
      setCurrentTime(video.currentTime || 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setVolume(video.volume); setMuted(video.muted);
      if (video.buffered.length && Number.isFinite(video.duration) && video.duration > 0) setBuffered((video.buffered.end(video.buffered.length - 1) / video.duration) * 100);
      if (!live && performance.now() - lastSavedAt > 3000 && video.currentTime > 5 && video.duration > 0) {
        lastSavedAt = performance.now();
        try { localStorage.setItem(`wiva-progress:${assetId}`, String(video.currentTime)); } catch {}
      }
    };
    const restoreProgress = () => {
      if (live || !Number.isFinite(video.duration)) return;
      try {
        const saved = Number(localStorage.getItem(`wiva-progress:${assetId}`));
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
      const ahead = video.buffered.end(video.buffered.length - 1) - video.currentTime;
      if (ahead < 4 || video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return;
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
        if (!liveRecoveryTimerRef.current) liveRecoveryTimerRef.current = setInterval(recoverLivePlayback, 250);
      } else setMessage("جارٍ الانتقال إلى الموضع المطلوب…");
    };
    const onCanPlay = () => { clearBuffering(); if (live) recoverLivePlayback(); else setMessage(""); };
    const onEnded = () => { setState("paused"); try { localStorage.removeItem(`wiva-progress:${assetId}`); } catch {} };
    const onMediaError = () => { setState("error"); setMessage("تعذر تشغيل الفيديو الآن. جرّب مرة أخرى."); };
    const onVolume = () => { sync(); try { localStorage.setItem("wiva-cloud-volume", String(video.volume)); } catch {} };
    const onFullscreen = () => setFullscreen(document.fullscreenElement === shell);
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest("input,button,select,textarea")) return;
      const key = event.key.toLowerCase();
      if (key === " " || key === "k") { event.preventDefault(); togglePlayback(); }
      else if (key === "f") { event.preventDefault(); void toggleFullscreen(); }
      else if (key === "m") { event.preventDefault(); video.muted = !video.muted; }
      else if (!live && event.key === "ArrowRight") { event.preventDefault(); seekBy(10); }
      else if (!live && event.key === "ArrowLeft") { event.preventDefault(); seekBy(-10); }
      revealControls();
    };
    for (const name of ["timeupdate", "durationchange", "loadedmetadata", "progress", "seeking", "seeked"]) video.addEventListener(name, sync);
    video.addEventListener("progress", recoverLivePlayback);
    video.addEventListener("loadedmetadata", restoreProgress); video.addEventListener("playing", onPlaying); video.addEventListener("pause", onPause); video.addEventListener("waiting", onWaiting); video.addEventListener("canplay", onCanPlay); video.addEventListener("ended", onEnded); video.addEventListener("error", onMediaError); video.addEventListener("volumechange", onVolume);
    document.addEventListener("fullscreenchange", onFullscreen); shell.addEventListener("keydown", onKey);
    return () => {
      for (const name of ["timeupdate", "durationchange", "loadedmetadata", "progress", "seeking", "seeked"]) video.removeEventListener(name, sync);
      video.removeEventListener("progress", recoverLivePlayback);
      if (liveRecoveryTimerRef.current) clearInterval(liveRecoveryTimerRef.current);
      liveRecoveryTimerRef.current = null;
      if (bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current);
      bufferingTimerRef.current = null;
      video.removeEventListener("loadedmetadata", restoreProgress); video.removeEventListener("playing", onPlaying); video.removeEventListener("pause", onPause); video.removeEventListener("waiting", onWaiting); video.removeEventListener("canplay", onCanPlay); video.removeEventListener("ended", onEnded); video.removeEventListener("error", onMediaError); video.removeEventListener("volumechange", onVolume);
      document.removeEventListener("fullscreenchange", onFullscreen); shell.removeEventListener("keydown", onKey);
    };
  }, [assetId, live, revealControls, seekBy, toggleFullscreen, togglePlayback]);

  useEffect(() => () => stop(), [stop]);

  const showStartup = ["idle", "loading", "ready", "error", "blocked", "paywall"].includes(state);
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const playing = state === "playing";

  return (
    <div ref={shellRef} className={`player-stage wiva-cloud-player ${controlsVisible ? "controls-visible" : "controls-hidden"}`} tabIndex={0} onPointerMove={() => revealControls(!playing)} onPointerDown={() => revealControls(!playing)}>
      <video ref={videoRef} playsInline disablePictureInPicture={false} controlsList="nodownload" onClick={handleVideoClick} onDoubleClick={handleVideoDoubleClick} />
      {showStartup ? <div className="player-overlay">
        {state === "paywall" ? <LockKeyhole size={38} /> : state === "blocked" ? <LockKeyhole size={38} /> : state === "error" ? <AlertTriangle size={38} /> : state === "loading" ? <LoaderCircle className="spin" size={42} /> : <Play size={44} fill="currentColor" />}
        <h2>{state === "paywall" ? "تابع المشاهدة" : state === "blocked" ? "المحتوى غير متاح" : state === "error" ? "تعذر بدء التشغيل" : state === "loading" ? "جارٍ تجهيز التشغيل…" : state === "ready" ? "الفيديو جاهز" : "جاهز للمشاهدة"}</h2>
        <p>{message || (state === "blocked" ? "هذا المحتوى غير متاح حاليًا." : "اضغط تشغيل وابدأ المشاهدة.")}</p>
        {state === "paywall" ? <div className="player-paywall-actions"><a className="button primary" href="/signup"><UserPlus size={18} /> ابدأ 3 أيام مجانًا</a><a className="button secondary" href="/login"><LogIn size={18} /> تسجيل الدخول</a></div> : active && state !== "loading" ? <button className="button primary player-start" onClick={state === "ready" ? resume : play}>{state === "error" ? <RotateCcw size={19} /> : <Play size={19} />} {state === "error" ? "إعادة المحاولة" : "تشغيل الآن"}</button> : null}
      </div> : null}

      {!showStartup && buffering ? <div className="player-buffering" role="status" aria-live="polite"><LoaderCircle className="spin" /><span>{message || "لحظات ونكمل المشاهدة…"}</span></div> : null}
      {gestureHint ? <div className="player-gesture-hint" aria-live="polite"><Maximize size={18} />{gestureHint}</div> : null}

      {!showStartup ? <div className="wiva-cloud-controls" dir="rtl">
        {!live && duration > 0 ? <div className="wiva-cloud-timeline">
          <input aria-label="موضع الفيلم" type="range" min="0" max={duration} step="0.1" value={Math.min(currentTime, duration)} style={{ "--played": `${progress}%`, "--buffered": `${Math.max(progress, buffered)}%` } as CSSProperties} onChange={(event) => { if (videoRef.current) videoRef.current.currentTime = Number(event.target.value); }} />
          <span dir="ltr">{formatTime(currentTime)} / {formatTime(duration)}</span>
        </div> : null}
        <div className="wiva-cloud-control-row">
          <div className="wiva-cloud-control-group">
            <button className="player-control-button primary-control" onClick={togglePlayback} aria-label={playing ? "إيقاف مؤقت" : "تشغيل"}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button>
            {!live ? <><button className="player-control-button seek-control" onClick={() => seekBy(-10)} aria-label="رجوع عشر ثوان"><Rewind /><small>10</small></button><button className="player-control-button seek-control" onClick={() => seekBy(10)} aria-label="تقديم عشر ثوان"><FastForward /><small>10</small></button></> : <span className="player-live-badge"><i /><Radio size={15} /> مباشر</span>}
            <button className="player-control-button" onClick={() => { const video = videoRef.current; if (video) video.muted = !video.muted; }} aria-label={muted ? "تشغيل الصوت" : "كتم الصوت"}>{muted || volume === 0 ? <VolumeX /> : <Volume2 />}</button>
            <input className="player-volume" aria-label="مستوى الصوت" type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={(event) => { const video = videoRef.current; if (video) { video.volume = Number(event.target.value); video.muted = false; } }} />
          </div>
          <div className="wiva-cloud-control-group">
            <div className="player-settings-wrap"><button className="player-control-button" onClick={() => setSettingsOpen((value) => !value)} aria-label="إعدادات المشغل"><Settings /></button>
              {settingsOpen ? <div className="player-settings-menu"><strong><Gauge size={16} /> سرعة التشغيل</strong>{live ? <p>السرعة تلقائية للبث المباشر</p> : <div>{[0.75, 1, 1.25, 1.5, 2].map((value) => <button key={value} className={speed === value ? "active" : ""} onClick={() => { const video = videoRef.current; if (video) video.playbackRate = value; setSpeed(value); setSettingsOpen(false); }}>{value === 1 ? "عادي" : `${value}×`}</button>)}</div>}<small>الجودة: تلقائية</small></div> : null}
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
