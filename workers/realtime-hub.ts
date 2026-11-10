import { DurableObject } from "cloudflare:workers";
import type { RealtimeInvalidation } from "../server/realtime";

type RealtimeEnvironment = {
  APP_SESSION_SECRET?: string;
};

const allowedRoots = new Set([
  "admin", "adminPortal", "appointments", "auth", "bookings", "chat", "notifications", "owner",
  "pitches", "push", "reports", "rewards", "schedules", "subscriptions", "suggestions", "support", "users", "wallet",
]);
const allowedAdminAreas = new Set([
  "assistant", "audit", "customerActivity", "overview", "qrLogs", "receipts", "reports", "rewards", "settings",
  "subscriptions", "support", "suggestions", "users", "venues",
]);

export class ElBarzilyRealtimeHub extends DurableObject<RealtimeEnvironment> {
  private isInternal(request: Request): boolean {
    const secret = this.env.APP_SESSION_SECRET;
    return Boolean(secret && request.headers.get("x-realtime-internal") === secret);
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.isInternal(request)) return Response.json({ error: "forbidden" }, { status: 403 });
    const path = new URL(request.url).pathname;

    if (path === "/connect") {
      if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("WebSocket upgrade required", { status: 426 });
      }
      const userId = request.headers.get("x-realtime-user-id");
      const role = request.headers.get("x-realtime-role");
      if (!userId || !/^\d+$/.test(userId) || !role) {
        return Response.json({ error: "authentication_required" }, { status: 401 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.ctx.acceptWebSocket(server, ["authenticated"]);
      server.serializeAttachment({ userId, role });
      return new Response(null, {
        status: 101,
        webSocket: client,
        headers: { "Sec-WebSocket-Protocol": "elbarzily-realtime-v1" },
      });
    }

    if (path === "/publish" && request.method === "POST") {
      let candidate: unknown;
      try {
        candidate = await request.json();
      } catch {
        return Response.json({ error: "invalid_event" }, { status: 400 });
      }
      const input = candidate as Partial<RealtimeInvalidation> | null;
      if (!input || input.type !== "invalidate" || !Array.isArray(input.roots) || !Array.isArray(input.adminAreas)) {
        return Response.json({ error: "invalid_event" }, { status: 400 });
      }
      const event: RealtimeInvalidation = {
        type: "invalidate",
        roots: [...new Set(input.roots.filter((value): value is string => typeof value === "string" && allowedRoots.has(value)))],
        adminAreas: [...new Set(input.adminAreas.filter((value): value is string => typeof value === "string" && allowedAdminAreas.has(value)))],
      };
      if (event.roots.length === 0 && event.adminAreas.length === 0) return Response.json({ delivered: 0 });

      const message = JSON.stringify(event);
      let delivered = 0;
      for (const socket of this.ctx.getWebSockets("authenticated")) {
        if (socket.readyState !== WebSocket.OPEN) continue;
        try {
          socket.send(message);
          delivered += 1;
        } catch {
          try { socket.close(1011, "Realtime delivery failed"); } catch { /* socket already closed */ }
        }
      }
      return Response.json({ delivered });
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (message === "ping") {
      try { socket.send("pong"); } catch { /* socket already closed */ }
      return;
    }
    try { socket.close(1008, "Read-only realtime channel"); } catch { /* socket already closed */ }
  }

  async webSocketClose(): Promise<void> {
    // Hibernatable WebSockets are removed by the runtime after close.
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    try { socket.close(1011, "Realtime channel error"); } catch { /* socket already closed */ }
  }
}
