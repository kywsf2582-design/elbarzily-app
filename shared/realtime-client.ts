export type RealtimeInvalidation = {
  type: "invalidate";
  roots: string[];
  adminAreas: string[];
};

export type RealtimeTicketProvider = () => Promise<string>;

export function connectRealtime(
  getTicket: RealtimeTicketProvider,
  onInvalidation: (event: RealtimeInvalidation) => void,
  onResume: () => void = () => undefined,
): () => void {
  if (typeof window === "undefined" || typeof WebSocket === "undefined") return () => undefined;

  const endpoint = new URL("/api/realtime", window.location.href);
  endpoint.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let reconnectDelay = 1_000;
  let lastResumeSync = 0;
  let lastForcedReconnect = 0;
  let connecting = false;
  let disposed = false;
  const isPageHidden = () => document.visibilityState === "hidden";

  const clearTimer = () => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const notifyResume = () => {
    const now = Date.now();
    if (now - lastResumeSync < 1_000) return;
    lastResumeSync = now;
    onResume();
  };

  const scheduleReconnect = () => {
    if (disposed || isPageHidden() || !navigator.onLine || reconnectTimer !== null) return;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
  };

  const connect = async () => {
    if (disposed || isPageHidden() || !navigator.onLine || connecting) return;
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) return;
    connecting = true;
    try {
      const ticket = await getTicket();
      if (disposed || isPageHidden() || !navigator.onLine) return;
      if (!ticket || ticket.length > 2_000) throw new Error("Realtime authentication ticket is unavailable");
      const connection = new WebSocket(endpoint.toString(), ["elbarzily-realtime-v1", `auth.${ticket}`]);
      socket = connection;
      connection.onopen = () => {
        reconnectDelay = 1_000;
        notifyResume();
      };
      connection.onmessage = message => {
        if (typeof message.data !== "string") return;
        try {
          const event = JSON.parse(message.data) as Partial<RealtimeInvalidation>;
          if (event.type === "invalidate" && Array.isArray(event.roots) && Array.isArray(event.adminAreas)) {
            onInvalidation({
              type: "invalidate",
              roots: event.roots.filter((value): value is string => typeof value === "string"),
              adminAreas: event.adminAreas.filter((value): value is string => typeof value === "string"),
            });
          }
        } catch {
          // Ignore malformed frames; WebSocket never carries application data.
        }
      };
      connection.onclose = () => {
        if (socket !== connection) return;
        socket = null;
        scheduleReconnect();
      };
      connection.onerror = () => connection.close();
    } catch {
      scheduleReconnect();
    } finally {
      connecting = false;
    }
  };

  const resume = () => {
    if (disposed || isPageHidden()) return;
    notifyResume();
    const now = Date.now();
    if (now - lastForcedReconnect < 1_500) return;
    lastForcedReconnect = now;
    clearTimer();
    const previous = socket;
    socket = null;
    if (previous && previous.readyState < WebSocket.CLOSING) previous.close(1000, "app resumed");
    void connect();
  };
  const onVisibilityChange = () => {
    if (isPageHidden()) {
      clearTimer();
      const previous = socket;
      socket = null;
      if (previous && previous.readyState < WebSocket.CLOSING) previous.close(1000, "app backgrounded");
      return;
    }
    resume();
  };
  const onOnline = () => resume();
  const onOffline = () => {
    const previous = socket;
    socket = null;
    if (previous && previous.readyState < WebSocket.CLOSING) previous.close(1001, "network offline");
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("focus", resume);
  window.addEventListener("pageshow", resume);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  void connect();

  return () => {
    disposed = true;
    clearTimer();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("focus", resume);
    window.removeEventListener("pageshow", resume);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    const previous = socket;
    socket = null;
    if (previous && previous.readyState < WebSocket.CLOSING) previous.close(1000, "component disposed");
  };
}
