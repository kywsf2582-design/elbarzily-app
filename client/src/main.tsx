import { trpc } from "@/lib/trpc";
import { COOKIE_NAME } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
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
// Production uses the same-origin Pages Function proxy so session cookies remain first-party.
const API_BASE_URL = import.meta.env.PROD ? "" : (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
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
      fetch(input, init) {
        return globalThis.fetch(input, { ...(init ?? {}), credentials: "include" });
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
    void navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
  });
}
