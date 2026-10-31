import type { Response } from "express";
import { randomUUID } from "node:crypto";

type RealtimeEvent = { id: string; type: string; payload: Record<string, unknown>; createdAt: string };
type Client = { userId: number; response: Response };

const clients = new Set<Client>();

export function attachRealtimeClient(userId: number, response: Response) {
  const client = { userId, response };
  clients.add(client);
  response.write(`event: ready\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`);
  return () => clients.delete(client);
}

export function emitRealtime(userIds: number | number[], type: string, payload: Record<string, unknown> = {}) {
  const recipients = new Set(Array.isArray(userIds) ? userIds : [userIds]);
  if (!recipients.size) return;
  const event: RealtimeEvent = { id: randomUUID(), type, payload, createdAt: new Date().toISOString() };
  const encoded = `id: ${event.id}\nevent: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    if (!recipients.has(client.userId)) continue;
    try { client.response.write(encoded); } catch { clients.delete(client); }
  }
}

export function realtimeHeartbeat() {
  for (const client of clients) {
    try { client.response.write(`event: ping\ndata: ${Date.now()}\n\n`); } catch { clients.delete(client); }
  }
}

setInterval(realtimeHeartbeat, 25_000).unref();
