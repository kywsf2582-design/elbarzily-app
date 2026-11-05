import { useEffect } from "react";
import { trpc } from "@/lib/trpc";

const api = trpc as any;

export default function PresenceHeartbeat() {
  const user = api.auth.me.useQuery(undefined, { retry: false, staleTime: 0 });
  const heartbeat = api.social.presence.heartbeat.useMutation();

  useEffect(() => {
    if (!user.data) return;
    const ping = () => {
      if (document.visibilityState === "visible") heartbeat.mutate({ path: window.location.pathname, action: "active" });
    };
    ping();
    const interval = window.setInterval(ping, 60_000);
    document.addEventListener("visibilitychange", ping);
    window.addEventListener("focus", ping);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", ping);
      window.removeEventListener("focus", ping);
    };
  }, [user.data?.id]);

  return null;
}
