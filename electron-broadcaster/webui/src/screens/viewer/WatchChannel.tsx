import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLink, useAppPath } from "@/components/AppLink";
import { api, type Channel } from "@/lib/api";
import { QueryBoundary } from "@/components/States";

export function WatchChannel() {
  const id = useAppPath().split("/").filter(Boolean).at(-1) || "";
  const state = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState });
  const agent = useQuery({ queryKey: ["agent-state"], queryFn: api.agentState });

  return (
    <div>
      <AppLink href="/live" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>
        ← البث المباشر
      </AppLink>
      <QueryBoundary query={state}>
        {(data) => {
          const channels = (((data.channels as Channel[]) || []).length
            ? (data.channels as Channel[])
            : [...(((data.broadcast as Channel[]) || [])), ...(((data.iptv as Channel[]) || []))]);
          const channel = channels.find((ch) => String(ch.id) === String(id));
          const src = channel?.playUrl || `/iptv/${encodeURIComponent(id)}/index.m3u8`;
          const isIptv = channel?.type === "iptv" || String(id).startsWith("cloud-") || src.startsWith("/iptv/");
          return (
            <>
              {isIptv ? <HlsPlayer src={src} /> : <BroadcastPlayer channelId={id} livePort={Number(agent.data?.ports?.live) || undefined} />}
              <div className="row-between">
                <h1 className="page-title">{channel?.name || `القناة ${id}`}</h1>
                <span className="badge badge-dot badge-live">بث مباشر</span>
              </div>
              <p className="page-subtitle">
                إذا لم يبدأ التشغيل تلقائيًا، جرّب إعادة فتح القناة أو تأكد أن مصدر البث يعمل من لوحة الإدارة.
              </p>
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}

function HlsPlayer({ src }: { src: string }) {
  return (
    <div className="card" style={{ overflow: "hidden", marginBottom: 20 }}>
      <video
        controls
        autoPlay
        playsInline
        style={{ width: "100%", aspectRatio: "16/9", background: "#000", display: "block" }}
        src={src}
      />
    </div>
  );
}

function BroadcastPlayer({ channelId, livePort }: { channelId: string; livePort?: number }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [status, setStatus] = useState("جاري الاتصال بمصدر البث...");
  const [ready, setReady] = useState(false);

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
      setStatus("جاري الاتصال بمصدر البث...");
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        setStatus("تعذر فتح اتصال البث. سنعيد المحاولة تلقائيًا.");
        retry = setTimeout(connect, 2500);
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        setStatus("تم الاتصال. ننتظر مصدر القناة...");
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
          if (!msg.hasBroadcaster) setStatus("القناة غير متاحة حاليًا. شغّل المصدر من لوحة الإدارة أو اختر قناة أخرى.");
          return;
        }
        if (msg.type === "broadcaster-online") {
          setStatus("المصدر يعمل الآن. جاري فتح الصورة...");
          return;
        }
        if (msg.type === "broadcaster-left") {
          cleanupPeer();
          setStatus("توقف مصدر البث مؤقتًا. سنحاول إعادة الاتصال تلقائيًا.");
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
  }, [channelId, livePort]);

  return (
    <div className="card" style={{ overflow: "hidden", marginBottom: 20, position: "relative" }}>
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        style={{ width: "100%", aspectRatio: "16/9", background: "#000", display: "block" }}
      />
      {!ready ? (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 24, textAlign: "center", background: "rgba(2,6,23,.72)" }}>
          <div>
            <div className="spinner" style={{ margin: "0 auto 12px" }} />
            <strong>{status}</strong>
          </div>
        </div>
      ) : null}
    </div>
  );
}
