import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

const baseUrl = (process.env.WORKER_URL || "https://elbarzily-api-staging.a62165368.workers.dev").replace(/\/$/, "");
const pagesOrigin = "https://elbarzily-neon-staging.pages.dev";

async function expectJson(url, expectedStatus = 200, headers = {}) {
  const response = await fetch(url, { headers });
  const body = await response.json().catch(() => null);
  if (response.status !== expectedStatus) {
    throw new Error(`${url} returned HTTP ${response.status}; expected ${expectedStatus}`);
  }
  return { response, body };
}

try {
  const { response: healthResponse, body: health } = await expectJson(`${baseUrl}/api/health`);
  if (health?.status !== "ok" || health?.runtime !== "cloudflare-workers") {
    throw new Error("Unexpected Worker health payload");
  }
  console.log("PASS /api/health", healthResponse.status);

  const { response: dbResponse, body: dbHealth } = await expectJson(`${baseUrl}/api/health/db`);
  if (dbHealth?.status !== "ok" || dbHealth?.database !== "connected") {
    throw new Error("Hyperdrive database health did not confirm a connection");
  }
  if (dbHealth?.callSignalsTable !== true) {
    throw new Error("Neon is connected, but the chat_call_signals table is missing");
  }
  console.log("PASS /api/health/db (connection + call-signals table)", dbResponse.status);

  const cors = await fetch(`${baseUrl}/api/health`, { headers: { Origin: pagesOrigin } });
  if (cors.headers.get("access-control-allow-origin") !== pagesOrigin) {
    throw new Error("Pages origin was not allowed by CORS");
  }
  console.log("PASS Pages CORS allow-list");

  const trpc = createTRPCProxyClient({
    links: [httpBatchLink({ url: `${baseUrl}/api/trpc`, transformer: superjson })],
  });
  const result = await trpc.system.health.query({ timestamp: Date.now() });
  if (result?.ok !== true) throw new Error("Unexpected tRPC health response");
  console.log("PASS tRPC system.health");

  const publishedPitches = await trpc.pitches.list.query();
  if (!Array.isArray(publishedPitches?.items)) {
    throw new Error("pitches.list did not return its expected read-only result");
  }
  console.log("PASS pitches.list (read-only database schema query)");

  const currentUser = await trpc.auth.me.query();
  if (currentUser !== null) throw new Error("Expected an unauthenticated request to have no user");
  console.log("PASS auth.me without a session");

  async function expectUnauthorized(label, operation) {
    try {
      await operation();
    } catch (error) {
      if (error?.data?.code === "UNAUTHORIZED") {
        console.log(`PASS ${label} rejects unauthenticated access`);
        return;
      }
      throw error;
    }
    throw new Error(`${label} unexpectedly allowed an unauthenticated request`);
  }

  await expectUnauthorized("auth.canClaimAdmin", () => trpc.auth.canClaimAdmin.query());
  await expectUnauthorized("bookings.mine", () => trpc.bookings.mine.query());
} catch (error) {
  console.error("FAIL remote Worker smoke test:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
