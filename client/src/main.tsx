import { trpc } from "@/lib/trpc";
import { persistPublicQueryCache, restorePublicQueryCache } from "@/lib/offlineCache";
import { COOKIE_NAME } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: 0 },
  },
});
restorePublicQueryCache(queryClient);
persistPublicQueryCache(queryClient);
// Production uses the same-origin Pages Function proxy so session cookies remain first-party.
const API_BASE_URL = import.meta.env.PROD ? "" : (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const offlineErrorResponse = () => new Response(JSON.stringify({ error: { json: { message: "النت فصل؟ اتأكد إنك متصل بالإنترنت وجرب تاني.", data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 503 } } } }), { status: 503, headers: { "content-type": "application/json" } });

const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: `${API_BASE_URL}/api/trpc`,
      transformer: superjson,
      headers() {
        // Optional Preview fallback for Manus OAuth sessions; email sessions use the secure cookie.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(value => value.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) return { Authorization: `Bearer ${token}` };
          }
        } catch { /* sessionStorage may be unavailable */ }
        return {};
      },
      async fetch(input, init) {
        const requestInit = { ...(init ?? {}), credentials: "include" as RequestCredentials, cache: "no-store" as RequestCache };
        let response: Response;
        try { response = await globalThis.fetch(input, requestInit); } catch (error) { if (error instanceof Error && error.name === "AbortError") throw error; return offlineErrorResponse(); }
        const contentType = response.headers.get("content-type") || "";
        if (contentType.toLowerCase().includes("json")) return response;
        await new Promise(resolve => setTimeout(resolve, 350));
        let retry: Response;
        try { retry = await globalThis.fetch(input, requestInit); } catch (error) { if (error instanceof Error && error.name === "AbortError") throw error; return offlineErrorResponse(); }
        const retryType = retry.headers.get("content-type") || "";
        if (retryType.toLowerCase().includes("json")) return retry;
        response = retry;
        return new Response(JSON.stringify({ error: { json: { message: "النت فصل؟ اتأكد إنك متصل بالإنترنت وجرب تاني.", data: { code: "INTERNAL_SERVER_ERROR", httpStatus: response.status || 503 } } } }), {
          status: response.status >= 400 ? response.status : 503,
          headers: { "content-type": "application/json" },
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
  );

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js")
      .then(registration => registration.update().catch(() => undefined))
      .catch(() => undefined);
  });
}
