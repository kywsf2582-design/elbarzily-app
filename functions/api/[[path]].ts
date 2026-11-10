import { resolveApiWorkerOrigin, type ApiProxyEnv } from "../_shared/apiWorkerOrigin";

export async function onRequest({ request, env }: { request: Request; env?: ApiProxyEnv }): Promise<Response> {
  const incoming = new URL(request.url);
  const origin = resolveApiWorkerOrigin(request, env);
  if (!origin) return new Response("API origin is misconfigured", { status: 503 });

  const destination = new URL(`${incoming.pathname}${incoming.search}`, origin);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  // Keep redirects (including large installer downloads) at the browser instead of proxying file bytes.
  return fetch(new Request(destination, init));
}
