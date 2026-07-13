import { useEffect, useRef, useState, useCallback } from "react";

export type LiveStatus = "connecting" | "online" | "offline";

export interface LiveEvent {
  type: string;
  data: unknown;
  at: number;
}

interface UseLiveOptions {
  /** SSE endpoint. WebSocket is used only when an explicit wsPath is supplied. */
  path?: string;
  wsPath?: string;
  enabled?: boolean;
  onEvent?: (event: LiveEvent) => void;
}

/**
 * Subscribes to the Agent's live event stream.
 * Uses EventSource (SSE), whose native reconnect behavior is ideal for an
 * always-on LAN dashboard. A WebSocket transport is opt-in because the Agent
 * does not expose a WebSocket endpoint for these events.
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
    let retryAttempt = 0;

    const wsUrl = () => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${location.host}${wsPath}`;
    };

    const scheduleReconnect = () => {
      if (closed || retry) return;
      setStatus("offline");
      const delay = Math.min(30_000, 1_000 * (2 ** Math.min(retryAttempt, 5)));
      retryAttempt += 1;
      retry = setTimeout(wsPath ? connectWs : connectSse, delay);
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
      retry = null;
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        scheduleReconnect();
        return;
      }
      setStatus("connecting");
      ws.onopen = () => {
        retryAttempt = 0;
        setStatus("online");
      };
      ws.onmessage = (ev) => handleMessage(String(ev.data));
      ws.onerror = () => ws?.close();
      ws.onclose = () => scheduleReconnect();
    }

    function connectSse() {
      retry = null;
      if (typeof EventSource === "undefined") {
        if (wsPath) connectWs();
        else setStatus("offline");
        return;
      }
      setStatus("connecting");
      try {
        es = new EventSource(path, { withCredentials: true });
      } catch {
        scheduleReconnect();
        return;
      }
      es.onopen = () => {
        retryAttempt = 0;
        setStatus("online");
      };
      es.onmessage = (ev) => handleMessage(String(ev.data));
      es.onerror = () => {
        es?.close();
        es = null;
        scheduleReconnect();
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
