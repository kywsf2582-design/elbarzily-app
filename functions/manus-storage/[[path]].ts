import { resolveApiWorkerOrigin, type ApiProxyEnv } from "../_shared/apiWorkerOrigin";

export async function onRequest({ request, env }: { request: Request; env?: ApiProxyEnv }): Promise<Response> {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });

  const incoming = new URL(request.url);
  const origin = resolveApiWorkerOrigin(request, env);
  if (!origin) return new Response("Storage origin is misconfigured", { status: 503 });

  const destination = new URL(`${incoming.pathname}${incoming.search}`, origin);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  return fetch(new Request(destination, { method: "GET", headers, redirect: "manual" }));
}
