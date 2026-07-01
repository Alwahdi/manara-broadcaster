import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  PictureInPicture2, RotateCw, Settings, Radio, Keyboard, AlertTriangle, ArrowRight, Send,
} from "lucide-react";
import { useHlsPlayer } from "@/hooks/use-hls-player";
import type { Channel } from "@/lib/channels";
import { cn } from "@/lib/utils";

interface Props {
  channel: Channel;
}

export function VideoPlayer({ channel }: Props) {
  const {
    videoRef, status, statusMessage, levels, currentLevel,
    isMuted, volume, setQuality, toggleMute, changeVolume,
    togglePlay, requestPiP, reload,
  } = useHlsPlayer(channel.streamUrl);

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showQuality, setShowQuality] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  }, []);

  const wakeControls = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (status === "playing") setShowControls(false);
    }, 3000);
  }, [status]);

  useEffect(() => { wakeControls(); }, [status, wakeControls]);

  // Keyboard shortcuts (when player is in viewport / focused)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      switch (e.key) {
        case " ":
        case "k":
        case "K":
          e.preventDefault();
          togglePlay();
          wakeControls();
          break;
        case "m":
        case "M":
          e.preventDefault();
          toggleMute();
          wakeControls();
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "ArrowUp":
          e.preventDefault();
          changeVolume(Math.min(1, volume + 0.05));
          wakeControls();
          break;
        case "ArrowDown":
          e.preventDefault();
          changeVolume(Math.max(0, volume - 0.05));
          wakeControls();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, toggleMute, toggleFullscreen, changeVolume, volume, wakeControls]);

  const isPlaying = status === "playing";
  const isLoading = status === "connecting";
  const needsManual = status === "manual";
  const hasError = status === "error";
  const friendlyStatus = isLoading ? "جاري الاتصال بالبث..." : statusMessage;

  return (
    <div
      ref={containerRef}
      onMouseMove={wakeControls}
      onTouchStart={wakeControls}
    className="group relative w-full overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-elegant ring-1 ring-white/5"
      style={{ aspectRatio: "16 / 9" }}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        playsInline
        onClick={togglePlay}
      />

      {isPlaying && (
        <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-live/30 bg-live/90 px-3 py-1.5 shadow-lg">
          <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
          <span className="text-xs font-black text-white">مباشر</span>
        </div>
      )}

      <div className={cn(
        "absolute left-4 top-4 rounded-2xl glass px-3 py-1.5 transition-opacity",
        showControls || !isPlaying ? "opacity-100" : "opacity-0"
      )}>
        <p className="text-xs font-extrabold text-white">{channel.name}</p>
        <p className="mt-0.5 text-[10px] text-white/60">تلفزيون ويفا</p>
      </div>

      {(isLoading || hasError || needsManual) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/62 p-5 text-center backdrop-blur-md animate-fade-in">
          {isLoading && (
            <>
              <div className="relative flex h-16 w-16 items-center justify-center">
                <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary/25 border-t-primary" />
                <Radio className="h-6 w-6 animate-pulse text-primary" />
              </div>
              <p className="text-sm font-bold text-white/85">{friendlyStatus}</p>
            </>
          )}
          {hasError && (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-destructive/30 bg-destructive/15">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <div className="max-w-md text-center">
                <h3 className="text-2xl font-black text-white">القناة غير متاحة حاليًا</h3>
                <p className="mt-2 text-sm leading-7 text-white/70">
                  تعذر على ويفا الاتصال بهذا البث. قد يكون المصدر متوقفًا، أو محظورًا، أو يستغرق وقتًا طويلًا للاستجابة.
                </p>
                {statusMessage && <details className="mt-3 text-xs text-white/55"><summary className="cursor-pointer text-primary">عرض التفاصيل التقنية</summary><p className="mt-2" dir="ltr">{statusMessage}</p></details>}
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <button onClick={reload} className="btn-primary inline-flex min-h-11 items-center gap-2 rounded-2xl px-5">
                  <RotateCw className="h-4 w-4" /> إعادة المحاولة
                </button>
                <button onClick={() => history.back()} className="btn-ghost inline-flex min-h-11 items-center gap-2 rounded-2xl px-5">
                  <ArrowRight className="h-4 w-4" /> اختيار قناة أخرى
                </button>
                <button className="btn-ghost inline-flex min-h-11 items-center gap-2 rounded-2xl px-5" type="button">
                  <Send className="h-4 w-4" /> إبلاغ المدير
                </button>
              </div>
            </>
          )}
          {needsManual && (
            <button
              onClick={() => { videoRef.current?.play().catch(() => {}); }}
              className="group/play flex items-center gap-3 rounded-2xl bg-gradient-primary px-7 py-3.5 font-bold text-primary-foreground shadow-glow transition hover:scale-[1.04] active:scale-100"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/25 ring-1 ring-white/40">
                <Play className="h-4 w-4" fill="currentColor" />
              </span>
              شاهد الآن
            </button>
          )}
        </div>
      )}

      {/* Top gradient for readability */}
      <div className={cn(
        "pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent transition-opacity",
        showControls || !isPlaying ? "opacity-100" : "opacity-0"
      )} />

      {/* Controls bar */}
      <div className={cn(
        "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/55 to-transparent p-3 pt-10 sm:p-4 sm:pt-12 transition-opacity duration-300",
        showControls ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        <div className="flex items-center gap-2 sm:gap-2.5">
          <button
            onClick={togglePlay}
            className="glass-btn rounded-full p-2.5 text-white"
            aria-label="تشغيل/إيقاف"
            title="مسافة"
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" fill="currentColor" />}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="glass-btn rounded-full p-2.5 text-white"
              aria-label="كتم"
              title="M"
            >
              {isMuted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <input
              type="range" min={0} max={1} step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              className="hidden sm:block h-1.5 w-24 cursor-pointer accent-primary-glow"
              aria-label="مستوى الصوت"
            />
          </div>

          <button
            onClick={reload}
            className="glass-btn rounded-full p-2.5 text-white"
            aria-label="إعادة الاتصال"
          >
            <RotateCw className="h-5 w-5" />
          </button>

          <div className="flex-1" />

          <button
            onClick={() => setShowHelp((s) => !s)}
            className="hidden sm:inline-flex glass-btn rounded-full p-2.5 text-white/80"
            aria-label="اختصارات"
            title="اختصارات لوحة المفاتيح"
          >
            <Keyboard className="h-4 w-4" />
          </button>

          {/* Quality */}
          {levels.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowQuality((s) => !s)}
                className="glass-btn flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-white"
              >
                <Settings className="h-4 w-4" />
                <span className="font-num">{currentLevel === -1 ? "تلقائي" : `${levels[currentLevel]?.height}p`}</span>
              </button>
              {showQuality && (
                <div className="absolute bottom-full right-0 mb-2 w-40 overflow-hidden rounded-2xl glass-strong shadow-elegant animate-scale-in">
                  <button
                    onClick={() => { setQuality(-1); setShowQuality(false); }}
                    className={cn("block w-full px-4 py-2.5 text-right text-sm transition hover:bg-white/10", currentLevel === -1 && "bg-primary/30 font-bold")}
                  >
                    تلقائي
                  </button>
                  {levels.map((lvl, i) => (
                    <button
                      key={i}
                      onClick={() => { setQuality(i); setShowQuality(false); }}
                      className={cn("block w-full px-4 py-2.5 text-right text-sm transition hover:bg-white/10 font-num", currentLevel === i && "bg-primary/30 font-bold")}
                    >
                      {lvl.height}p
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {"pictureInPictureEnabled" in document && (
            <button
              onClick={requestPiP}
              className="hidden sm:inline-flex glass-btn rounded-full p-2.5 text-white"
              aria-label="صورة داخل صورة"
              title="صورة داخل صورة"
            >
              <PictureInPicture2 className="h-5 w-5" />
            </button>
          )}

          <button
            onClick={toggleFullscreen}
            className="glass-btn rounded-full p-2.5 text-white"
            aria-label="ملء الشاشة"
            title="F"
          >
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Keyboard shortcuts help */}
      {showHelp && (
        <div className="absolute bottom-20 left-4 z-10 w-56 rounded-2xl glass-strong p-4 text-xs text-white/90 animate-scale-in shadow-elegant">
          <p className="mb-2 font-bold text-white">اختصارات المشغل</p>
          <ul className="space-y-1.5 font-num">
            <li className="flex justify-between"><span>تشغيل/إيقاف</span><kbd className="rounded bg-white/15 px-1.5">مسافة</kbd></li>
            <li className="flex justify-between"><span>كتم الصوت</span><kbd className="rounded bg-white/15 px-1.5">M</kbd></li>
            <li className="flex justify-between"><span>ملء الشاشة</span><kbd className="rounded bg-white/15 px-1.5">F</kbd></li>
            <li className="flex justify-between"><span>رفع الصوت</span><kbd className="rounded bg-white/15 px-1.5">↑</kbd></li>
            <li className="flex justify-between"><span>خفض الصوت</span><kbd className="rounded bg-white/15 px-1.5">↓</kbd></li>
          </ul>
        </div>
      )}
    </div>
  );
}
