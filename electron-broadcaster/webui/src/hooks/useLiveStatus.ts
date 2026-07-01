import { useEffect, useRef, useState, useCallback } from "react";

export type LiveStatus = "connecting" | "online" | "offline";

export interface LiveEvent {
  type: string;
  data: unknown;
  at: number;
}

interface UseLiveOptions {
  /** SSE endpoint. Falls back to WebSocket if EventSource fails. */
  path?: string;
  wsPath?: string;
  enabled?: boolean;
  onEvent?: (event: LiveEvent) => void;
}

/**
 * Subscribes to the Agent's live event stream.
 * Prefers EventSource (SSE) and transparently falls back to WebSocket,
 * with automatic reconnection — designed for always-on LAN dashboards / TVs.
 */
export function useLiveStatus(options: UseLiveOptions = {}) {
  const { path = "/api/live", wsPath, enabled = true, onEvent } = options;
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [last, setLast] = useState<LiveEvent | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const emit = useCallback((evt: LiveEvent) => {
    setLast(evt);
    onEventRef.current?.(evt);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let closed = false;
    let es: EventSource | null = null;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const wsUrl = () => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${location.host}${wsPath || path.replace(/^\/api\/live/, "/api/live/ws")}`;
    };

    const scheduleReconnect = () => {
      if (closed) return;
      setStatus("offline");
      retry = setTimeout(connectWs, 3000);
    };

    function handleMessage(raw: string) {
      setStatus("online");
      try {
        const parsed = JSON.parse(raw);
        emit({ type: parsed.type || "message", data: parsed.data ?? parsed, at: Date.now() });
      } catch {
        emit({ type: "message", data: raw, at: Date.now() });
      }
    }

    function connectWs() {
      if (closed) return;
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        scheduleReconnect();
        return;
      }
      setStatus("connecting");
      ws.onopen = () => setStatus("online");
      ws.onmessage = (ev) => handleMessage(String(ev.data));
      ws.onerror = () => ws?.close();
      ws.onclose = () => scheduleReconnect();
    }

    function connectSse() {
      if (typeof EventSource === "undefined") return connectWs();
      setStatus("connecting");
      try {
        es = new EventSource(path, { withCredentials: true });
      } catch {
        return connectWs();
      }
      es.onopen = () => setStatus("online");
      es.onmessage = (ev) => handleMessage(String(ev.data));
      es.onerror = () => {
        es?.close();
        es = null;
        // SSE failed (or endpoint missing) — fall back to WebSocket.
        connectWs();
      };
    }

    connectSse();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      es?.close();
      ws?.close();
    };
  }, [enabled, path, wsPath, emit]);

  return { status, last };
}
