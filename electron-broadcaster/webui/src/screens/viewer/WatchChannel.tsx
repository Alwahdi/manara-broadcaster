import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLink, useAppPath } from "@/components/AppLink";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { ChannelTile, ContentSection } from "@/components/common";
import { getViewerChannels } from "./viewer-utils";

type FitMode = "fit" | "fill" | "zoom";

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
              <div className="watch-channel-head player-page-head">
                <AppLink href="/live" className="btn btn-ghost btn-sm">
                  ← البث المباشر
                </AppLink>
                <div>
                  <span className="badge badge-dot badge-live">بث مباشر</span>
                  <h1 className="page-title">{channel?.name || `القناة ${id}`}</h1>
                </div>
              </div>
              <section className="player-stage">
              {isIptv ? (
                <>
                  {qualityOptions.length > 1 ? (
                    <div className="quality-switcher">
                      <div className="row-between quality-switcher-head">
                        <strong>جودة البث</strong>
                        <span className="muted">{activeQuality?.label || activeQuality?.name || "تلقائي"}</span>
                      </div>
                      <div className="row quality-switcher-options">
                        {qualityOptions.map((quality) => {
                          const qualityId = String(quality.id);
                          const active = String(activeQualityId) === qualityId;
                          return (
                            <button
                              key={qualityId}
                              type="button"
                              className={`btn ${active ? "btn-primary" : "btn-ghost"} btn-sm`}
                              onClick={() => setSelectedQualityId(qualityId)}
                            >
                              {quality.label || quality.name || "جودة"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  <HlsPlayer src={src} />
                </>
              ) : (
                <BroadcastPlayer channelId={id} livePort={Number(agent.data?.ports?.live) || undefined} />
              )}
              </section>
              <div className="player-info-grid">
                <div className="player-info-card">
                  <span>الحالة</span>
                  <strong>يبث الآن</strong>
                  <small>إذا انقطع الاتصال مؤقتًا سنحاول إعادة التشغيل تلقائيًا.</small>
                </div>
                <div className="player-info-card">
                  <span>النوع</span>
                  <strong>{isIptv ? "قناة مباشرة" : "بث مباشر"}</strong>
                  <small>{activeQuality?.label || activeQuality?.name || channel?.resolution || "جودة تلقائية"}</small>
                </div>
                <div className="player-info-card">
                  <span>الشبكة</span>
                  <strong>مشاهدة داخلية</strong>
                  <small>استمتع بالمشاهدة مباشرة من شبكتك.</small>
                </div>
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
  startLoad?: () => void;
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
  hlsScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-wiva-hls="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("تعذر تحميل مشغل البث.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "/hls.min.js";
    script.async = true;
    script.dataset.wivaHls = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("تعذر تحميل مشغل البث."));
    document.head.appendChild(script);
  });
  return hlsScriptPromise;
}

function HlsPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<HlsInstance | null>(null);
  const [status, setStatus] = useState("جاري تجهيز البث...");
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [fitMode, setFitMode] = useState<FitMode>("fill");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const media = video;
    let closed = false;

    function cleanup() {
      try { hlsRef.current?.destroy(); } catch {}
      hlsRef.current = null;
      try {
        media.pause();
        media.removeAttribute("src");
        media.load();
      } catch {}
    }

    async function start() {
      cleanup();
      setError("");
      setStatus("جاري تشغيل البث...");
      if (media.canPlayType("application/vnd.apple.mpegurl")) {
        media.src = src;
        try { await media.play(); } catch {}
        if (!closed) setStatus("");
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
        lowLatencyMode: true,
        backBufferLength: 30,
        manifestLoadingTimeOut: 15000,
        levelLoadingTimeOut: 15000,
        fragLoadingTimeOut: 20000,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(media);
      if (Hls.Events.MANIFEST_PARSED) {
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          media.play().catch(() => {});
          setStatus("");
        });
      }
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data?.fatal) return;
        if (data.type === Hls.ErrorTypes?.NETWORK_ERROR) {
          setStatus("انقطع الاتصال مؤقتًا، نحاول إعادة التشغيل...");
          try { hls.startLoad?.(); } catch {}
          return;
        }
        if (data.type === Hls.ErrorTypes?.MEDIA_ERROR) {
          setStatus("نعالج مشكلة في تشغيل الفيديو...");
          try { hls.recoverMediaError?.(); } catch {}
          return;
        }
        setStatus("");
        setError("تعذر تشغيل هذا البث الآن. جرّب جودة أخرى أو أعد المحاولة.");
      });
    }

    start().catch((err: Error) => {
      if (closed) return;
      setStatus("");
      setError(err.message || "تعذر تشغيل البث.");
    });

    return () => {
      closed = true;
      cleanup();
    };
  }, [src, retryKey]);

  return (
    <div className="live-player-card">
      <div className="player-chrome-top">
        <span className="badge badge-dot badge-live">مباشر</span>
        <span>مشغل البث</span>
      </div>
      <PlayerFitToolbar fitMode={fitMode} setFitMode={setFitMode} />
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        className={`live-player-video live-player-video-${fitMode}`}
      />
      {status || error ? (
        <div className="live-player-overlay">
          <div>
            {status && !error ? <div className="spinner overlay-spinner" /> : null}
            <strong>{error || status}</strong>
            {error ? (
              <div className="overlay-action">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setRetryKey((value) => value + 1)}>
                  إعادة المحاولة
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BroadcastPlayer({ channelId, livePort }: { channelId: string; livePort?: number }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [status, setStatus] = useState("جاري تشغيل البث...");
  const [ready, setReady] = useState(false);
  const [fitMode, setFitMode] = useState<FitMode>("fill");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    function cleanupPeer() {
      try { pcRef.current?.close(); } catch {}
      pcRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setReady(false);
    }

    function wsUrl() {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = livePort ? `${window.location.hostname}:${livePort}` : window.location.host;
      return `${proto}//${host}/ws`;
    }

    function connect() {
      if (closed) return;
      cleanupPeer();
      setStatus("جاري تشغيل البث...");
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        setStatus("تعذر تشغيل البث الآن. سنحاول مرة أخرى...");
        retry = setTimeout(connect, 2500);
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        setStatus("جاري تجهيز القناة...");
        ws.send(JSON.stringify({ type: "register-viewer", channelId }));
      };
      ws.onerror = () => {
        setStatus("حدث انقطاع في اتصال البث.");
        try { ws.close(); } catch {}
      };
      ws.onclose = () => {
        if (closed) return;
        cleanupPeer();
        setStatus("انقطع الاتصال. سنعيد المحاولة خلال لحظات.");
        retry = setTimeout(connect, 2500);
      };
      ws.onmessage = async (event) => {
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(String(event.data)); } catch { return; }
        if (msg.type === "viewer-id") {
          if (!msg.hasBroadcaster) setStatus("القناة غير متاحة حاليًا. اختر قناة أخرى أو جرّب لاحقًا.");
          return;
        }
        if (msg.type === "broadcaster-online") {
          setStatus("جاري فتح الصورة...");
          return;
        }
        if (msg.type === "broadcaster-left") {
          cleanupPeer();
          setStatus("انقطع الاتصال مؤقتًا، نحاول إعادة التشغيل...");
          return;
        }
        if (msg.type === "offer" && typeof msg.sdp === "string") {
          cleanupPeer();
          const pc = new RTCPeerConnection({ iceServers: [] });
          pcRef.current = pc;
          pc.ontrack = (ev) => {
            if (videoRef.current) {
              videoRef.current.srcObject = ev.streams[0];
              setReady(true);
              setStatus("يبث الآن");
            }
          };
          pc.onicecandidate = (ev) => {
            if (ev.candidate && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ice", candidate: ev.candidate }));
            }
          };
          await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.send(JSON.stringify({ type: "answer", sdp: answer.sdp }));
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
      if (retry) clearTimeout(retry);
      try { wsRef.current?.close(); } catch {}
      cleanupPeer();
    };
  }, [channelId, livePort, retryKey]);

  return (
    <div className="live-player-card">
      <div className="player-chrome-top">
        <span className="badge badge-dot badge-live">مباشر</span>
        <span>مشغل البث</span>
      </div>
      <PlayerFitToolbar fitMode={fitMode} setFitMode={setFitMode} />
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        className={`live-player-video live-player-video-${fitMode}`}
      />
      {!ready ? (
        <div className="live-player-overlay">
          <div>
            <div className="spinner overlay-spinner" />
            <strong>{status}</strong>
            <div className="overlay-action">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setRetryKey((value) => value + 1)}>
                إعادة الاتصال
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlayerFitToolbar({
  fitMode,
  setFitMode,
}: {
  fitMode: FitMode;
  setFitMode: (mode: FitMode) => void;
}) {
  return (
    <div className="live-player-toolbar" aria-label="حجم صورة البث">
      {([
        ["fit", "كامل"],
        ["fill", "ملء"],
        ["zoom", "تقريب"],
      ] as const).map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          className={fitMode === mode ? "active" : ""}
          onClick={() => setFitMode(mode)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
