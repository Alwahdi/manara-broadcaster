"use client";

import Hls from "hls.js";
import {
  AlertTriangle, FastForward, Gauge, LoaderCircle, LockKeyhole, Maximize, Minimize,
  Pause, PictureInPicture2, Play, Radio, Rewind, RotateCcw, Settings, Volume2, VolumeX,
} from "lucide-react";
import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";

type State = "idle" | "loading" | "ready" | "playing" | "paused" | "error" | "blocked";

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  const minutes = Math.floor(value / 60) % 60;
  const hours = Math.floor(value / 3600);
  return hours ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

export function PlayerClient({ assetId, active }: { assetId: string; active: boolean }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startupCleanupRef = useRef<(() => void) | null>(null);
  const liveRecoveryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  const revealControls = useCallback((keep = false) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setControlsVisible(true);
    if (!keep) hideTimer.current = setTimeout(() => setControlsVisible(false), 3200);
  }, []);

  const stop = useCallback(() => {
    startupCleanupRef.current?.(); startupCleanupRef.current = null;
    if (liveRecoveryTimerRef.current) clearInterval(liveRecoveryTimerRef.current);
    liveRecoveryTimerRef.current = null;
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
      if (!response.ok) throw new Error(payload.error || "تعذر تجهيز التشغيل");
      const video = videoRef.current;
      if (!video) return;
      const url = String(payload.url); const isLive = payload.live === true;
      setLive(isLive);
      if (isLive && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: false, startFragPrefetch: true, liveSyncDurationCount: 8, liveMaxLatencyDurationCount: 30, maxLiveSyncPlaybackRate: 1, maxBufferLength: 90, maxMaxBufferLength: 180, backBufferLength: 0, fragLoadingMaxRetry: 10, manifestLoadingMaxRetry: 6 });
        hlsRef.current = hls; hls.loadSource(url); hls.attachMedia(video);
        let started = false;
        const startWhenBuffered = () => {
          if (started || !video.buffered.length) return;
          const ahead = video.buffered.end(video.buffered.length - 1) - video.currentTime;
          if (ahead < 12) return;
          started = true; void resume();
        };
        hls.on(Hls.Events.MANIFEST_PARSED, () => setMessage("جارٍ تكوين مخزون قصير لبث سلس…"));
        hls.on(Hls.Events.BUFFER_APPENDED, startWhenBuffered);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          setMessage(data.response?.code === 502 ? "المزوّد لم يرسل بثًا صالحًا الآن." : "انقطع البث. جرّب إعادة المحاولة.");
          setState("error"); hls.destroy();
        });
      } else {
        const media = video;
        media.src = url; media.preload = "auto"; setMessage("جارٍ تجهيز مخزون قصير لتشغيل متواصل…");
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
          if (ahead >= 8 || media.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) start();
        }
        startupCleanupRef.current = cleanup;
        for (const event of ["progress", "canplay", "canplaythrough", "loadeddata"]) media.addEventListener(event, startWhenReady);
        fallback = setTimeout(start, 10_000);
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
    const onPlaying = () => { setState("playing"); setMessage(""); revealControls(); };
    const onPause = () => setState((value) => value === "playing" ? "paused" : value);
    const recoverLivePlayback = () => {
      if (!live || !video.buffered.length) return;
      const ahead = video.buffered.end(video.buffered.length - 1) - video.currentTime;
      if (ahead < 8 || video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return;
      if (liveRecoveryTimerRef.current) clearInterval(liveRecoveryTimerRef.current);
      liveRecoveryTimerRef.current = null;
      // A waiting event does not mean the user paused. Keep the player visible
      // and let the existing user gesture continue playback as soon as MSE has
      // enough forward data (Samsung/Android may not emit another progress event).
      if (!video.paused) { setState("playing"); setMessage(""); return; }
      void video.play().then(() => { setState("playing"); setMessage(""); }).catch(() => setState("ready"));
    };
    const onWaiting = () => {
      if (live) {
        setMessage("جارٍ تثبيت البث…");
        recoverLivePlayback();
        if (!liveRecoveryTimerRef.current) liveRecoveryTimerRef.current = setInterval(recoverLivePlayback, 250);
      } else setMessage("جارٍ جلب الجزء المطلوب…");
    };
    const onCanPlay = () => { if (live) recoverLivePlayback(); else setMessage(""); };
    const onEnded = () => { setState("paused"); try { localStorage.removeItem(`wiva-progress:${assetId}`); } catch {} };
    const onMediaError = () => { setState("error"); setMessage("تعذر قراءة الفيديو من المزوّد. جرّب مرة أخرى."); };
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
      video.removeEventListener("loadedmetadata", restoreProgress); video.removeEventListener("playing", onPlaying); video.removeEventListener("pause", onPause); video.removeEventListener("waiting", onWaiting); video.removeEventListener("canplay", onCanPlay); video.removeEventListener("ended", onEnded); video.removeEventListener("error", onMediaError); video.removeEventListener("volumechange", onVolume);
      document.removeEventListener("fullscreenchange", onFullscreen); shell.removeEventListener("keydown", onKey);
    };
  }, [assetId, live, revealControls, seekBy, toggleFullscreen, togglePlayback]);

  useEffect(() => () => stop(), [stop]);

  const showStartup = ["idle", "loading", "ready", "error", "blocked"].includes(state);
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const playing = state === "playing";

  return (
    <div ref={shellRef} className={`player-stage wiva-cloud-player ${controlsVisible ? "controls-visible" : "controls-hidden"}`} tabIndex={0} onPointerMove={() => revealControls(!playing)} onPointerDown={() => revealControls(!playing)}>
      <video ref={videoRef} playsInline disablePictureInPicture={false} onClick={togglePlayback} />
      {showStartup ? <div className="player-overlay">
        {state === "blocked" ? <LockKeyhole size={38} /> : state === "error" ? <AlertTriangle size={38} /> : state === "loading" ? <LoaderCircle className="spin" size={42} /> : <Play size={44} fill="currentColor" />}
        <h2>{state === "blocked" ? "المحتوى غير مفعّل" : state === "error" ? "تعذر بدء التشغيل" : state === "loading" ? "جارٍ تجهيز التشغيل…" : state === "ready" ? "الفيديو جاهز" : "جاهز للمشاهدة"}</h2>
        <p>{message || (state === "blocked" ? "يلزم تفعيل مصدر مرخّص من لوحة الإدارة." : "اتصال مشفّر، والمصدر يبدأ عند الضغط فقط.")}</p>
        {active && state !== "loading" ? <button className="button primary player-start" onClick={state === "ready" ? resume : play}>{state === "error" ? <RotateCcw size={19} /> : <Play size={19} />} {state === "error" ? "إعادة المحاولة" : "تشغيل الآن"}</button> : null}
      </div> : null}

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
