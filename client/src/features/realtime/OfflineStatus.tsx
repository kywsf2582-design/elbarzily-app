import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";

export default function OfflineStatus() {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const [realtime, setRealtime] = useState(true);
  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    const onRealtime = (event: Event) => setRealtime(Boolean((event as CustomEvent).detail?.connected));
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("elbarzily:realtime", onRealtime);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); window.removeEventListener("elbarzily:realtime", onRealtime); };
  }, []);
  if (!offline && realtime) return null;
  return <div className="offline-status" role="status"><CloudOff size={15} /><span>{offline ? "أنت غير متصل — نعرض آخر بيانات محفوظة" : "جاري إعادة الاتصال…"}</span><RefreshCw size={14} className="offline-spin" /></div>;
}
