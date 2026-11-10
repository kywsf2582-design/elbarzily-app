import { AlertTriangle, Home, RotateCcw, WifiOff } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; recoveryAttempted: boolean; }

function isChunkError(error: Error | null) {
  const message = String(error?.message || "").toLowerCase();
  return /failed to fetch dynamically imported module|loading chunk|importing a module script failed|chunkloaderror|networkerror/.test(message);
}

function friendlyMessage(error: Error | null) {
  if (isChunkError(error)) {
    return "الصفحة اتحدّثت بنسخة جديدة، والتطبيق بيجهّزها دلوقتي. اضغط إعادة المحاولة لو ما فتحتش تلقائيًا.";
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "اتصال الإنترنت انقطع مؤقتًا. بياناتك محفوظة، ارجع اتصل بالإنترنت واضغط إعادة المحاولة.";
  }
  return "حصل عطل مؤقت أثناء فتح الجزء ده. بياناتك لم تُحذف، ويمكنك إعادة المحاولة أو الرجوع للرئيسية.";
}

async function clearRuntimeCaches() {
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map(name => caches.delete(name)));
    }
  } catch { /* Cache cleanup is best-effort. */ }
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, recoveryAttempted: false };
  }

  static getDerivedStateFromError(error: Error): State {
    let recoveryAttempted = false;
    try { recoveryAttempted = sessionStorage.getItem("brzly-runtime-recovery") === "1"; } catch { /* Ignore unavailable storage. */ }
    return { hasError: true, error, recoveryAttempted };
  }

  componentDidCatch(error: Error) {
    if (!isChunkError(error) || this.state.recoveryAttempted) return;
    try { sessionStorage.setItem("brzly-runtime-recovery", "1"); } catch { /* Ignore unavailable storage. */ }
    void clearRuntimeCaches().finally(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("refresh", String(Date.now()));
      window.location.replace(url.toString());
    });
  }

  retry = async () => {
    try { sessionStorage.removeItem("brzly-runtime-recovery"); } catch { /* Ignore unavailable storage. */ }
    await clearRuntimeCaches();
    const url = new URL(window.location.href);
    url.searchParams.set("refresh", String(Date.now()));
    window.location.replace(url.toString());
  };

  goHome = () => {
    try { sessionStorage.removeItem("brzly-runtime-recovery"); } catch { /* Ignore unavailable storage. */ }
    window.location.assign("/");
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const chunkError = isChunkError(this.state.error);
    const code = chunkError ? "APP-UPDATE" : "APP-ERROR";
    return (
      <main className="app-error-screen" dir="rtl" role="alert">
        <section className="app-error-card">
          <div className="app-error-icon">{typeof navigator !== "undefined" && !navigator.onLine ? <WifiOff size={30} /> : <AlertTriangle size={30} />}</div>
          <span className="app-error-kicker">البرازيلي · {code}</span>
          <h1>{chunkError ? "بنجهّز آخر تحديث" : "حصل عطل مؤقت"}</h1>
          <p>{friendlyMessage(this.state.error)}</p>
          <div className="app-error-actions">
            <button type="button" className="app-error-primary" onClick={() => void this.retry()}><RotateCcw size={17} /> إعادة المحاولة</button>
            <button type="button" className="app-error-secondary" onClick={this.goHome}><Home size={17} /> الرجوع للرئيسية</button>
          </div>
          <small>لو استمرت المشكلة، صوّر الكود {code} وابعت الصورة للدعم.</small>
        </section>
      </main>
    );
  }
}

export default ErrorBoundary;
