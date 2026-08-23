"use client";
import { useEffect, useRef, useCallback } from "react";
import { getAccessToken } from "@/lib/apollo";

// Event types the server can send — must match backend's WsEventType exactly
export type WsEventType =
  | "lesson_completed"
  | "quiz_submitted"
  | "progress_updated"
  | "pong"
  | "error";

export interface WsEvent<T = unknown> {
  type: WsEventType;
  payload: T;
  timestamp: string;
}

type EventHandler = (event: WsEvent) => void;

interface UseWebSocketOptions {
  onEvent?: EventHandler;
  enabled?: boolean; // only connect when true — e.g. when user is logged in
}

export function useWebSocket({
  onEvent,
  enabled = true,
}: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    const token = getAccessToken();

    // No token yet (not logged in) — don't attempt connection
    if (!token || !enabled) return;

    // Don't open a second connection if one is already open/connecting
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const wsUrl = `ws://localhost:4000/ws?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("✅ WebSocket connected");

      // Keep the connection alive — send a ping every 25s
      // Browsers/proxies often kill idle connections after ~30s of silence
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 25_000);
    };

    ws.onmessage = (event) => {
      try {
        const parsed: WsEvent = JSON.parse(event.data);
        onEvent?.(parsed);
      } catch {
        // Ignore malformed messages — don't crash the app
      }
    };

    ws.onclose = (event) => {
      console.log("WebSocket closed:", event.code, event.reason);
      clearInterval(pingIntervalRef.current);

      // Auto-reconnect after 3s UNLESS it was a deliberate close
      // 1000 = normal closure, 1001 = going away (e.g. component unmounted)
      if (event.code !== 1000 && event.code !== 1001) {
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => {
      // onclose fires right after onerror and handles reconnect logic
      // no separate handling needed here
    };

    wsRef.current = ws;
  }, [enabled, onEvent]);

  useEffect(() => {
    connect();

    // Cleanup when component unmounts or dependencies change
    return () => {
      clearInterval(pingIntervalRef.current);
      clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close(1000, "Component unmounted");
    };
  }, [connect]);

  // Subscribe to a specific "room" — e.g. updates for one module
  const subscribe = useCallback((room: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "subscribe", room }));
    }
  }, []);

  const unsubscribe = useCallback((room: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "unsubscribe", room }));
    }
  }, []);

  return { subscribe, unsubscribe };
}
