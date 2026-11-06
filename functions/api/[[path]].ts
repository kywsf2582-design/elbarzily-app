const API_WORKER_ORIGIN = "https://elbarzily-api-staging.a62165368.workers.dev";

export async function onRequest({ request }: { request: Request }): Promise<Response> {
  const incoming = new URL(request.url);
  const destination = new URL(`${incoming.pathname}${incoming.search}`, API_WORKER_ORIGIN);
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
