import { useEffect } from "react";
import { trpc } from "@/lib/trpc";

type RealtimePayload = { type?: string; payload?: Record<string, unknown> };

export default function RealtimeBridge() {
  const utils = (trpc as any).useUtils();
  useEffect(() => {
    if (!("EventSource" in window)) return;
    let source: EventSource | null = null;
    let stopped = false;
    const notify = (connected: boolean) => window.dispatchEvent(new CustomEvent("elbarzily:realtime", { detail: { connected } }));
    const refresh = () => {
      void utils.auth.me.invalidate();
      void utils.notifications.list.invalidate();
      void utils.bookings.mine.invalidate();
      void utils.chat.rooms.invalidate();
      window.dispatchEvent(new CustomEvent("elbarzily:data-changed"));
    };
    const connect = () => {
      if (stopped) return;
      source = new EventSource("/api/realtime", { withCredentials: true });
      source.onopen = () => notify(true);
      source.onerror = () => { notify(false); source?.close(); window.setTimeout(connect, 3000); };
      const onEvent = (event: MessageEvent<string>) => {
        try {
          const message = JSON.parse(event.data) as RealtimePayload;
          if (message.type === "chat.message") {
            void utils.chat.rooms.invalidate();
            void utils.chat.messages.invalidate();
          }
          refresh();
        } catch { /* reconnect will recover from malformed or partial events */ }
      };
      ["booking.created", "booking.updated", "booking.cancelled", "chat.message", "notification.created"].forEach(type => source?.addEventListener(type, onEvent));
    };
    connect();
    return () => { stopped = true; source?.close(); notify(false); };
  }, [utils]);
  return null;
}
