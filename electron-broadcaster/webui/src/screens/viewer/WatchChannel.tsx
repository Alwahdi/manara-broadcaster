import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLink, useAppPath } from "@/components/AppLink";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { ChannelTile, ContentSection, FavoriteButton, ShareButton } from "@/components/common";
import { WivaMediaPlayer } from "@/components/WivaMediaPlayer";
import { getViewerChannels } from "./viewer-utils";

type CaptureQuality = "auto" | "1080" | "720" | "480";

function recommendedCaptureQuality(): Exclude<CaptureQuality, "auto"> {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string; saveData?: boolean } };
  const weakHardware = (nav.deviceMemory || 4) <= 2 || (nav.hardwareConcurrency || 4) <= 2;
  const constrainedNetwork = nav.connection?.saveData || ["slow-2g", "2g", "3g"].includes(nav.connection?.effectiveType || "");
  return weakHardware || constrainedNetwork ? "480" : "720";
}

export function WatchChannel() {
  const id = useAppPath().split("/").filter(Boolean).at(-1) || "";
  const [selectedQualityId, setSelectedQualityId] = useState(id);
  const state = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState });
  const agent = useQuery({ queryKey: ["agent-state"], queryFn: api.agentState });

  useEffect(() => {
    setSelectedQualityId(id);
  }, [id]);

  return (
    <div className="watch-channel-page">
      <div className="watch-backdrop" aria-hidden />
      <QueryBoundary query={state}>
        {(data) => {
          const channels = getViewerChannels(data);
          const channel = channels.find((ch) => String(ch.id) === String(id));
          const qualityOptions = Array.isArray(channel?.qualities) ? channel.qualities : [];
          const activeQualityId = qualityOptions.some((quality) => String(quality.id) === String(selectedQualityId))
            ? selectedQualityId
            : id;
          const src = channel?.playUrl && String(activeQualityId) === String(channel.id)
            ? channel.playUrl
            : `/iptv/${encodeURIComponent(activeQualityId)}/index.m3u8`;
          const isIptv = channel?.type === "iptv" || String(id).startsWith("cloud-") || src.startsWith("/iptv/");
          const activeQuality = qualityOptions.find((quality) => String(quality.id) === String(activeQualityId));
          const related = channels.filter((item) => String(item.id) !== String(channel?.id)).slice(0, 8);
          return (
            <>
              <AppLink href="/live" className="btn btn-ghost btn-sm player-back-link">
                ← البث المباشر
              </AppLink>
              <section className="player-stage">
              <div className="player-stage-glow" aria-hidden />
              {isIptv ? (
                <HlsPlayer
                  src={src}
                  settings={qualityOptions.length > 1 ? (
                    <QualityOptions
                      options={qualityOptions}
                      activeId={activeQualityId}
                      onChange={setSelectedQualityId}
                    />
                  ) : undefined}
                />
              ) : (
                <BroadcastPlayer channelId={id} livePort={Number(agent.data?.ports?.live) || undefined} />
              )}
              </section>
              <div className="watch-channel-summary">
                <div className="channel-summary-logo">
                  {channel?.logo ? <img src={channel.logo} alt="" /> : <span>{String(channel?.name || "ق").slice(0, 1)}</span>}
                </div>
                <div className="channel-summary-copy">
                  <h1>{channel?.name || `القناة ${id}`}</h1>
                  <p><span className="badge badge-dot badge-live">مباشر</span> <span>·</span> الجودة {activeQuality?.label || activeQuality?.name || channel?.resolution || "تلقائية"}</p>
                </div>
              </div>
              <div className="watch-channel-actions">
                <FavoriteButton mediaId={channel?.id || id} compact={false} />
                <ShareButton />
                <AppLink href="/live/guide" className="btn btn-ghost btn-sm">دليل القنوات</AppLink>
              </div>
              {related.length ? (
                <ContentSection title="قنوات أخرى" subtitle="انتقل بسرعة إلى بث آخر">
                  <div className="live-channel-grid horizontal-rail">
                    {related.map((item) => (
                      <ChannelTile key={String(item.id)} channel={item} href="/watch/channel/$id" />
                    ))}
                  </div>
                </ContentSection>
              ) : null}
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}

type HlsErrorData = {
  fatal?: boolean;
  type?: string;
  details?: string;
};

type HlsInstance = {
  loadSource: (src: string) => void;
  attachMedia: (media: HTMLMediaElement) => void;
  on: (event: string, callback: (event: string, data: HlsErrorData) => void) => void;
  destroy: () => void;
  startLoad?: (startPosition?: number) => void;
  recoverMediaError?: () => void;
};

type HlsConstructor = {
  new (config?: Record<string, unknown>): HlsInstance;
  isSupported: () => boolean;
  Events: { ERROR: string; MANIFEST_PARSED?: string };
  ErrorTypes?: { MEDIA_ERROR?: string; NETWORK_ERROR?: string };
};

let hlsScriptPromise: Promise<void> | null = null;

function getHls() {
  return (window as Window & { Hls?: HlsConstructor }).Hls;
}

function loadHlsScript() {
  if (getHls()) return Promise.resolve();
  if (hlsScriptPromise) return hlsScriptPromise;
  const attempt = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-wiva-hls="true"]');
    if (existing) {
      existing.remove();
    }
    const script = document.createElement("script");
    script.src = "/hls.min.js";
    script.async = true;
    script.dataset.wivaHls = "true";
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error("تعذر تحميل مشغل البث."));
    };
    document.head.appendChild(script);
  });
  hlsScriptPromise = attempt.catch((error) => {
    hlsScriptPromise = null;
    throw error;
  });
  return hlsScriptPromise;
}

function HlsPlayer({ src, settings }: { src: string; settings?: ReactNode }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<HlsInstance | null>(null);
  const [status, setStatus] = useState("جاري تجهيز البث...");
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const media = video;
    let closed = false;
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let bufferingTimer: ReturnType<typeof setTimeout> | null = null;
    let stallRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let startupTimer: ReturnType<typeof setTimeout> | null = null;
    let hasPlayed = false;

    function clearBufferingTimer() {
      if (bufferingTimer) clearTimeout(bufferingTimer);
      bufferingTimer = null;
    }

    function clearStartupTimer() {
      if (startupTimer) clearTimeout(startupTimer);
      startupTimer = null;
    }

    function clearStallRecoveryTimer() {
      if (stallRecoveryTimer) clearTimeout(stallRecoveryTimer);
      stallRecoveryTimer = null;
    }

    function scheduleRestart(delay = 3500) {
      if (closed || recoveryTimer) return;
      recoveryTimer = setTimeout(() => {
        recoveryTimer = null;
        if (!closed) setRetryKey((value) => value + 1);
      }, delay);
    }

    function cleanup() {
      if (recoveryTimer) clearTimeout(recoveryTimer);
      recoveryTimer = null;
      clearBufferingTimer();
      clearStallRecoveryTimer();
      clearStartupTimer();
      try { hlsRef.current?.destroy(); } catch {}
      hlsRef.current = null;
      try {
        media.pause();
        media.removeAttribute("src");
        media.load();
      } catch {}
    }

    function markBuffering() {
      if (closed) return;
      if (!stallRecoveryTimer) {
        stallRecoveryTimer = setTimeout(() => {
          stallRecoveryTimer = null;
          if (closed || media.readyState >= 3) return;
          const current = media.currentTime || 0;
          for (let index = 0; index < media.buffered.length; index += 1) {
            const start = media.buffered.start(index);
            if (start > current && start - current <= 2) {
              media.currentTime = start + 0.05;
              break;
            }
          }
          try { hlsRef.current?.startLoad?.(-1); } catch {}
          media.play().catch(() => {});
        }, 1200);
      }
      if (bufferingTimer) return;
      bufferingTimer = setTimeout(() => {
        bufferingTimer = null;
        if (closed || error) return;
        if (hasPlayed && media.readyState < 3) setStatus("نعيد استقرار البث...");
      }, 4000);
    }

    function markPlaying() {
      hasPlayed = true;
      if (recoveryTimer) clearTimeout(recoveryTimer);
      recoveryTimer = null;
      setStarted(true);
      clearBufferingTimer();
      clearStallRecoveryTimer();
      clearStartupTimer();
      if (!closed) {
        setError("");
        setStatus("");
      }
    }

    function markVideoError() {
      if (closed) return;
      setStatus("");
      setError("تعذر تشغيل البث الآن. جرّب مرة أخرى.");
      scheduleRestart(5000);
    }

    media.addEventListener("waiting", markBuffering);
    media.addEventListener("stalled", markBuffering);
    media.addEventListener("playing", markPlaying);
    media.addEventListener("canplay", markPlaying);
    media.addEventListener("canplaythrough", markPlaying);
    media.addEventListener("error", markVideoError);

    async function start() {
      cleanup();
      setStarted(false);
      setError("");
      setStatus("جاري تشغيل البث...");
      startupTimer = setTimeout(() => {
        startupTimer = null;
        if (closed || hasPlayed) return;
        setStatus("");
        setError("استغرق تشغيل البث وقتًا أطول من المعتاد. جرّب مرة أخرى.");
      }, 15_000);
      if (media.canPlayType("application/vnd.apple.mpegurl")) {
        media.src = src;
        try {
          await media.play();
        } catch (playError) {
          if (playError instanceof DOMException && playError.name === "NotAllowedError") {
            clearStartupTimer();
            setStarted(true);
            setStatus("");
          }
        }
        return;
      }
      await loadHlsScript();
      if (closed) return;
      const Hls = getHls();
      if (!Hls?.isSupported()) {
        setStatus("");
        setError("هذا المتصفح لا يدعم تشغيل هذا النوع من البث.");
        return;
      }
      const hls = new Hls({
        lowLatencyMode: false,
        progressive: true,
        startFragPrefetch: true,
        startLevel: 0,
        capLevelToPlayerSize: true,
        abrEwmaDefaultEstimate: 500_000,
        abrEwmaFastLive: 6,
        abrEwmaSlowLive: 18,
        abrBandWidthFactor: 0.8,
        abrBandWidthUpFactor: 0.6,
        abrMaxWithRealBitrate: true,
        maxStarvationDelay: 4,
        maxLoadingDelay: 5,
        backBufferLength: 30,
        maxBufferLength: 45,
        maxMaxBufferLength: 90,
        maxBufferHole: 0.75,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 5,
        liveSyncDurationCount: 4,
        liveMaxLatencyDurationCount: 12,
        manifestLoadingTimeOut: 12000,
        manifestLoadingMaxRetry: 3,
        manifestLoadingRetryDelay: 600,
        manifestLoadingMaxRetryTimeout: 4000,
        levelLoadingTimeOut: 12000,
        levelLoadingMaxRetry: 3,
        levelLoadingRetryDelay: 600,
        levelLoadingMaxRetryTimeout: 4000,
        fragLoadingTimeOut: 15000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 500,
        fragLoadingMaxRetryTimeout: 8000,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(media);
      if (Hls.Events.MANIFEST_PARSED) {
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setError("");
          media.play().catch((playError) => {
            if (playError instanceof DOMException && playError.name === "NotAllowedError") {
              clearStartupTimer();
              setStarted(true);
              setStatus("");
            }
          });
        });
      }
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data?.fatal) return;
        if (data.type === Hls.ErrorTypes?.NETWORK_ERROR) {
          setStatus("انقطع الاتصال مؤقتًا، نحاول إعادة التشغيل...");
          try { hls.startLoad?.(); } catch {}
          scheduleRestart(10_000);
          return;
        }
        if (data.type === Hls.ErrorTypes?.MEDIA_ERROR) {
          setStatus("نعالج مشكلة في تشغيل الفيديو...");
          try { hls.recoverMediaError?.(); } catch {}
          scheduleRestart(7000);
          return;
        }
        setStatus("");
        setError("تعذر تشغيل هذا البث الآن. جرّب جودة أخرى أو أعد المحاولة.");
        scheduleRestart(8000);
      });
    }

    start().catch((err: Error) => {
      if (closed) return;
      setStatus("");
      setError(err.message || "تعذر تشغيل البث.");
    });

    return () => {
      closed = true;
      media.removeEventListener("waiting", markBuffering);
      media.removeEventListener("stalled", markBuffering);
      media.removeEventListener("playing", markPlaying);
      media.removeEventListener("canplay", markPlaying);
      media.removeEventListener("canplaythrough", markPlaying);
      media.removeEventListener("error", markVideoError);
      cleanup();
    };
  }, [src, retryKey]);

  return (
    <WivaMediaPlayer
      videoRef={videoRef}
      mode="live"
      status={status}
      error={error}
      started={started}
      settings={settings}
      onRetry={() => setRetryKey((value) => value + 1)}
      videoProps={{ autoPlay: true }}
    />
  );
}

function BroadcastPlayer({ channelId, livePort }: { channelId: string; livePort?: number }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const qualityRef = useRef<Exclude<CaptureQuality, "auto">>("720");
  const qualityModeRef = useRef<CaptureQuality>("auto");
  const [status, setStatus] = useState("جاري تشغيل البث...");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [quality, setQuality] = useState<CaptureQuality>("auto");

  useEffect(() => {
    qualityModeRef.current = quality;
    qualityRef.current = quality === "auto" ? recommendedCaptureQuality() : quality;
    try { localStorage.setItem("wiva-capture-quality", quality); } catch {}
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "set-quality", quality: qualityRef.current }));
  }, [quality]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("wiva-capture-quality");
      if (["auto", "1080", "720", "480"].includes(saved || "")) setQuality(saved as CaptureQuality);
    } catch {}
  }, []);

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let remoteTrackTimer: ReturnType<typeof setTimeout> | null = null;
    let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let qualityTimer: ReturnType<typeof setInterval> | null = null;
    let startupTimer: ReturnType<typeof setTimeout> | null = null;
    let streamReady = false;
    let previousVideoStats = {
      received: 0,
      lost: 0,
      decoded: 0,
      dropped: 0,
      freezes: 0,
      jitterBufferDelay: 0,
      jitterBufferEmitted: 0,
    };
    let weakQualitySamples = 0;
    let stableQualitySamples = 0;
    let decoderStallSamples = 0;
    let lastAutomaticQualityChangeAt = 0;

    function clearRetry() {
      if (retry) clearTimeout(retry);
      retry = null;
    }

    function clearRemoteTrackTimer() {
      if (remoteTrackTimer) clearTimeout(remoteTrackTimer);
      remoteTrackTimer = null;
    }

    function clearDisconnectTimer() {
      if (disconnectTimer) clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }

    function clearQualityTimer() {
      if (qualityTimer) clearInterval(qualityTimer);
      qualityTimer = null;
    }

    function clearStartupTimer() {
      if (startupTimer) clearTimeout(startupTimer);
      startupTimer = null;
    }

    function startAdaptiveQuality(pc: RTCPeerConnection, ws: WebSocket) {
      clearQualityTimer();
      clearStartupTimer();
      qualityTimer = setInterval(async () => {
        if (qualityModeRef.current !== "auto" || pc.connectionState !== "connected") {
          weakQualitySamples = 0;
          stableQualitySamples = 0;
          decoderStallSamples = 0;
          return;
        }
        try {
          const report = await pc.getStats();
          let received = 0;
          let lost = 0;
          let jitter = 0;
          let decoded = 0;
          let dropped = 0;
          let freezes = 0;
          let jitterBufferDelay = 0;
          let jitterBufferEmitted = 0;
          report.forEach((stat) => {
            if (stat.type === "inbound-rtp" && stat.kind === "video") {
              received += Number(stat.packetsReceived || 0);
              lost += Number(stat.packetsLost || 0);
              jitter = Math.max(jitter, Number(stat.jitter || 0));
              decoded += Number(stat.framesDecoded || 0);
              dropped += Number(stat.framesDropped || 0);
              freezes += Number(stat.freezeCount || 0);
              jitterBufferDelay += Number(stat.jitterBufferDelay || 0);
              jitterBufferEmitted += Number(stat.jitterBufferEmittedCount || 0);
            }
          });
          const receivedDelta = Math.max(0, received - previousVideoStats.received);
          const lostDelta = Math.max(0, lost - previousVideoStats.lost);
          const decodedDelta = Math.max(0, decoded - previousVideoStats.decoded);
          const droppedDelta = Math.max(0, dropped - previousVideoStats.dropped);
          const freezeDelta = Math.max(0, freezes - previousVideoStats.freezes);
          const jitterDelayDelta = Math.max(0, jitterBufferDelay - previousVideoStats.jitterBufferDelay);
          const jitterEmittedDelta = Math.max(0, jitterBufferEmitted - previousVideoStats.jitterBufferEmitted);
          previousVideoStats = {
            received,
            lost,
            decoded,
            dropped,
            freezes,
            jitterBufferDelay,
            jitterBufferEmitted,
          };
          const total = receivedDelta + lostDelta;
          const lossRate = total ? lostDelta / total : 0;
          const frameTotal = decodedDelta + droppedDelta;
          const dropRate = frameTotal ? droppedDelta / frameTotal : 0;
          const averageJitterBufferDelay = jitterEmittedDelta ? jitterDelayDelta / jitterEmittedDelta : 0;
          const decoderStalled = receivedDelta > 0 && decodedDelta === 0;
          decoderStallSamples = decoderStalled ? decoderStallSamples + 1 : 0;
          const weak = lossRate > 0.03
            || jitter > 0.1
            || dropRate > 0.1
            || freezeDelta > 0
            || averageJitterBufferDelay > 0.22
            || decoderStallSamples >= 2;
          const severelyWeak = lossRate > 0.1
            || jitter > 0.22
            || dropRate > 0.3
            || freezeDelta >= 2
            || averageJitterBufferDelay > 0.45
            || decoderStallSamples >= 3;
          if (weak) {
            weakQualitySamples += 1;
            stableQualitySamples = 0;
          } else {
            stableQualitySamples += 1;
            weakQualitySamples = 0;
          }
          const now = Date.now();
          let next = qualityRef.current;
          if ((severelyWeak || weakQualitySamples >= 2) && qualityRef.current !== "480") {
            next = "480";
          } else if (
            stableQualitySamples >= 6
            && qualityRef.current === "480"
            && now - lastAutomaticQualityChangeAt >= 45_000
          ) {
            next = recommendedCaptureQuality();
          }
          if (next !== qualityRef.current && ws.readyState === WebSocket.OPEN) {
            qualityRef.current = next;
            lastAutomaticQualityChangeAt = now;
            weakQualitySamples = 0;
            stableQualitySamples = 0;
            ws.send(JSON.stringify({ type: "set-quality", quality: next }));
          }
        } catch {}
      }, 5000);
    }

    function tuneReceiverBuffer(pc: RTCPeerConnection) {
      for (const receiver of pc.getReceivers()) {
        const tunable = receiver as RTCRtpReceiver & {
          jitterBufferTarget?: number;
          playoutDelayHint?: number;
        };
        const target = receiver.track?.kind === "audio" ? 0.12 : 0.18;
        try { tunable.jitterBufferTarget = target; } catch {}
        try { tunable.playoutDelayHint = target; } catch {}
      }
    }

    function cleanupPeer() {
      clearRemoteTrackTimer();
      clearDisconnectTimer();
      clearQualityTimer();
      const previousPeer = pcRef.current;
      pcRef.current = null;
      try { previousPeer?.close(); } catch {}
      if (videoRef.current) videoRef.current.srcObject = null;
      setReady(false);
    }

    function scheduleReconnect(message = "انقطع الاتصال. سنعيد المحاولة خلال لحظات.", delay = 2200) {
      if (closed || retry) return;
      setReady(false);
      setStatus(message);
      setError("");
      try { wsRef.current?.close(); } catch {}
      cleanupPeer();
      retry = setTimeout(() => {
        retry = null;
        connect();
      }, delay);
    }

    function watchRemoteStream(remoteStream: MediaStream, pc: RTCPeerConnection) {
      clearRemoteTrackTimer();
      for (const track of remoteStream.getTracks()) {
        track.onended = () => {
          if (pcRef.current === pc) scheduleReconnect("انقطع الصوت أو الصورة مؤقتًا، نحاول إعادة التشغيل...", 1500);
        };
        if (track.kind === "audio") {
          // Capture-card audio can briefly report muted while the HDMI clock
          // settles. The track normally resumes without rebuilding the video.
          track.onmute = () => clearRemoteTrackTimer();
          track.onunmute = () => clearRemoteTrackTimer();
        }
      }
    }

    function wsUrl() {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = livePort ? `${window.location.hostname}:${livePort}` : window.location.host;
      return `${proto}//${host}/ws`;
    }

    function connect() {
      if (closed) return;
      cleanupPeer();
      streamReady = false;
      setError("");
      setStatus("جاري تشغيل البث...");
      startupTimer = setTimeout(() => {
        startupTimer = null;
        if (closed || streamReady) return;
        setStatus("");
        setError("تعذر بدء البث الآن. تأكد من توفر القناة ثم جرّب مرة أخرى.");
      }, 15_000);
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        scheduleReconnect("تعذر تشغيل البث الآن. سنحاول مرة أخرى...", 2500);
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        clearRetry();
        setError("");
        setStatus("جاري تجهيز القناة...");
        ws.send(JSON.stringify({ type: "register-viewer", channelId, quality: qualityRef.current }));
      };
      ws.onerror = () => {
        setStatus("حدث انقطاع في اتصال البث.");
        try { ws.close(); } catch {}
      };
      ws.onclose = () => {
        if (closed) return;
        scheduleReconnect();
      };
      ws.onmessage = async (event) => {
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(String(event.data)); } catch { return; }
        if (msg.type === "viewer-id") {
          if (!msg.hasBroadcaster) setStatus("جاري تجهيز القناة...");
          return;
        }
        if (msg.type === "broadcaster-online") {
          setError("");
          setStatus("جاري فتح الصورة...");
          return;
        }
        if (msg.type === "broadcaster-left") {
          scheduleReconnect("انقطع الاتصال مؤقتًا، نحاول إعادة التشغيل...", 1800);
          return;
        }
        if (msg.type === "offer" && typeof msg.sdp === "string") {
          cleanupPeer();
          const pc = new RTCPeerConnection({ iceServers: [] });
          pcRef.current = pc;
          pc.ontrack = (ev) => {
            if (pcRef.current !== pc) return;
            if (videoRef.current) {
              videoRef.current.srcObject = ev.streams[0];
              watchRemoteStream(ev.streams[0], pc);
              streamReady = true;
              clearStartupTimer();
              setReady(true);
              setError("");
              setStatus("يبث الآن");
            }
          };
          pc.onicecandidate = (ev) => {
            if (pcRef.current === pc && ev.candidate && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ice", candidate: ev.candidate }));
            }
          };
          pc.onconnectionstatechange = () => {
            if (closed || pcRef.current !== pc) return;
            if (pc.connectionState === "connected") {
              clearDisconnectTimer();
              startAdaptiveQuality(pc, ws);
              streamReady = true;
              clearStartupTimer();
              setReady(true);
              setError("");
              setStatus("يبث الآن");
              return;
            }
            if (pc.connectionState === "disconnected") {
              if (!disconnectTimer) {
                disconnectTimer = setTimeout(() => {
                  disconnectTimer = null;
                  if (pc.connectionState === "disconnected") scheduleReconnect("انقطع الاتصال مؤقتًا، نحاول إعادة التشغيل...", 1200);
                }, 6000);
              }
              return;
            }
            if (pc.connectionState === "failed" || pc.connectionState === "closed") {
              scheduleReconnect("انقطع الاتصال مؤقتًا، نحاول إعادة التشغيل...", 1800);
            }
          };
          pc.oniceconnectionstatechange = () => {
            if (closed || pcRef.current !== pc) return;
            if (pc.iceConnectionState === "failed") {
              scheduleReconnect("انقطع الاتصال مؤقتًا، نحاول إعادة التشغيل...", 1800);
            }
          };
          await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
          if (pcRef.current !== pc) return;
          tuneReceiverBuffer(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (pcRef.current === pc && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "answer", sdp: answer.sdp }));
          }
          return;
        }
        if (msg.type === "ice" && pcRef.current && msg.candidate) {
          try { await pcRef.current.addIceCandidate(msg.candidate as RTCIceCandidateInit); } catch {}
        }
      };
    }

    connect();
    return () => {
      closed = true;
      clearRetry();
      clearRemoteTrackTimer();
      clearDisconnectTimer();
      clearQualityTimer();
      try { wsRef.current?.close(); } catch {}
      cleanupPeer();
    };
  }, [channelId, livePort, retryKey]);

  return (
    <WivaMediaPlayer
      videoRef={videoRef}
      mode="live"
      status={ready ? "" : status}
      error={error}
      settings={<CaptureQualityControl quality={quality} onChange={setQuality} />}
      onRetry={() => setRetryKey((value) => value + 1)}
      retryLabel="إعادة الاتصال"
      videoProps={{ autoPlay: true }}
    />
  );
}

function CaptureQualityControl({ quality, onChange }: { quality: CaptureQuality; onChange: (quality: CaptureQuality) => void }) {
  return (
    <label className="wiva-player-quality" role="menuitem">
      <span>الجودة</span>
      <select value={quality} onChange={(event) => onChange(event.target.value as CaptureQuality)} aria-label="جودة بث HDMI">
        <option value="auto">تلقائية</option>
        <option value="1080">Full HD 1080p</option>
        <option value="720">HD 720p</option>
        <option value="480">SD 480p</option>
      </select>
    </label>
  );
}

function QualityOptions({
  options,
  activeId,
  onChange,
}: {
  options: Array<{ id: string | number; label?: string; name?: string }>;
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="wiva-player-quality-list" aria-label="جودة البث">
      <strong>الجودة</strong>
      {options.map((option) => {
        const optionId = String(option.id);
        return (
          <button
            key={optionId}
            type="button"
            role="menuitemradio"
            aria-checked={String(activeId) === optionId}
            className={String(activeId) === optionId ? "active" : ""}
            onClick={() => onChange(optionId)}
          >
            {option.label || option.name || "جودة تلقائية"}
          </button>
        );
      })}
    </div>
  );
}
