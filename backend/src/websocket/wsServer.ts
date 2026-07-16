import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { Server } from "http";
import { verifyAccessToken } from "../services/authService";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

// Every connected client gets one of these objects
interface AuthenticatedClient {
  ws: WebSocket;
  userId: string;
  subscriptions: Set<string>; // rooms this client is subscribed to
  // e.g. 'module:abc123', 'quiz:xyz789'
}

// All event types the server can send to clients
export type WsEventType =
  | "lesson_completed"
  | "quiz_submitted"
  | "progress_updated"
  | "error"
  | "pong";

// Every message sent over WebSocket follows this shape
export interface WsEvent<T = unknown> {
  type: WsEventType;
  payload: T;
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────
// Client registry
// Global Map: userId → AuthenticatedClient
// One active connection per user — new login replaces old connection
// ─────────────────────────────────────────────────────────────
const clients = new Map<string, AuthenticatedClient>();

// ─────────────────────────────────────────────────────────────
// Setup function
// Called once from index.ts with the existing HTTP server
// Attaches WebSocket server to the SAME port as Express/GraphQL
// ─────────────────────────────────────────────────────────────
export function setupWebSocketServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({
    server: httpServer, // share port 4000 with HTTP
    path: "/ws", // WebSocket URL: ws://localhost:4000/ws
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    // ── Authenticate the connection ──────────────────────────
    // Token passed as URL query param: ws://localhost:4000/ws?token=xxx
    // Why not a header? Browser WebSocket API does not support custom headers
    // Query param is the standard workaround
    const url = new URL(req.url!, `ws://${req.headers.host}`);
    const token = url.searchParams.get("token");

    if (!token) {
      sendEvent(ws, {
        type: "error",
        payload: { message: "Authentication token required" },
        timestamp: now(),
      });
      ws.close(1008, "Unauthorized"); // 1008 = Policy Violation close code
      return;
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      sendEvent(ws, {
        type: "error",
        payload: { message: "Invalid or expired token" },
        timestamp: now(),
      });
      ws.close(1008, "Unauthorized");
      return;
    }

    // ── Register client ──────────────────────────────────────
    // If user already has an open connection, close the old one
    // This handles: page refresh, multiple tabs, token rotation
    const existing = clients.get(payload.sub);
    if (existing) {
      existing.ws.close(1001, "Replaced by new connection");
    }

    const client: AuthenticatedClient = {
      ws,
      userId: payload.sub,
      subscriptions: new Set(),
    };
    clients.set(payload.sub, client);

    console.log(`🔌 WS connected: user ${payload.sub} (${clients.size} total)`);

    // ── Handle incoming messages from client ─────────────────
    ws.on("message", (rawData: Buffer) => {
      try {
        const message = JSON.parse(rawData.toString());

        switch (message.type) {
          case "ping":
            // Client sends ping every 25s to keep connection alive
            // Server responds with pong
            sendEvent(ws, { type: "pong", payload: {}, timestamp: now() });
            break;

          case "subscribe":
            // Client wants real-time updates for a specific room
            // Example: when user opens a module page, subscribe to 'module:{id}'
            if (message.room && typeof message.room === "string") {
              client.subscriptions.add(message.room);
              console.log(
                `📡 User ${payload.sub} subscribed to ${message.room}`,
              );
            }
            break;

          case "unsubscribe":
            if (message.room) {
              client.subscriptions.delete(message.room);
            }
            break;

          default:
            // Unknown message type — ignore silently
            break;
        }
      } catch {
        // Malformed JSON — ignore, don't crash the server
      }
    });

    // ── Handle disconnection ─────────────────────────────────
    ws.on("close", (code, reason) => {
      clients.delete(payload.sub);
      console.log(
        `🔌 WS disconnected: user ${payload.sub} | code: ${code} | reason: ${reason.toString() || "none"}`,
      );
    });

    ws.on("error", (err) => {
      // Log but don't crash — onclose fires after onerror and handles cleanup
      console.error(`WS error for user ${payload.sub}:`, err.message);
    });
  });

  // ── Heartbeat: detect dead connections ────────────────────
  // Some clients drop without sending a close frame
  // (mobile apps backgrounded, network loss, browser tab killed)
  // Ping every 30s — if no pong comes back the connection is dead
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping(); // built-in WebSocket ping — different from our app-level ping
      }
    });
  }, 30_000);

  // Clean up interval when the WebSocket server itself closes
  wss.on("close", () => clearInterval(heartbeat));

  console.log("🔌 WebSocket server ready at ws://localhost:4000/ws");

  return wss;
}

// ─────────────────────────────────────────────────────────────
// Utility functions — imported by resolvers to emit events
// ─────────────────────────────────────────────────────────────

// Send event to one specific user
export function sendToUser(userId: string, event: WsEvent): void {
  const client = clients.get(userId);

  if (!client) return; // user not connected — that's fine, just skip

  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(event));
  }
}

// Send event to all users subscribed to a room
// Example: broadcastToRoom('module:abc123', progressEvent)
export function broadcastToRoom(room: string, event: WsEvent): void {
  for (const client of clients.values()) {
    if (
      client.subscriptions.has(room) &&
      client.ws.readyState === WebSocket.OPEN
    ) {
      client.ws.send(JSON.stringify(event));
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

function sendEvent(ws: WebSocket, event: WsEvent): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

function now(): string {
  return new Date().toISOString();
}
