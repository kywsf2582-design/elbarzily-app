import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = Number(process.env.WORKER_TEST_PORT || 8791);
const baseUrl = `http://127.0.0.1:${port}`;
const pagesOrigin = "https://elbarzily-neon-staging.pages.dev";
const child = spawn(
  "pnpm",
  ["exec", "wrangler", "dev", "--local", "--ip", "127.0.0.1", "--port", String(port), "--log-level", "error"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BROWSER: "none",
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
        process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ||
        "postgres://worker_test:worker_test@127.0.0.1:1/worker_test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let output = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", chunk => {
    output += chunk.toString();
    if (output.length > 12_000) output = output.slice(-12_000);
  });
}

async function waitForHealth() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`wrangler exited early (${child.exitCode})`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return response;
    } catch { /* wait for Wrangler's local runtime */ }
    await delay(500);
  }
  throw new Error("Timed out waiting for Worker health endpoint");
}

try {
  const healthResponse = await waitForHealth();
  const health = await healthResponse.json();
  if (health.status !== "ok" || health.runtime !== "cloudflare-workers") {
    throw new Error(`unexpected health response: ${JSON.stringify(health)}`);
  }
  console.log("PASS /api/health");

  const dbHealth = await fetch(`${baseUrl}/api/health/db`);
  if (dbHealth.status !== 503) {
    throw new Error(`database health must fail closed without Hyperdrive (got ${dbHealth.status})`);
  }
  console.log("PASS database health fails closed without Hyperdrive");

  const allowed = await fetch(`${baseUrl}/api/health`, { headers: { Origin: pagesOrigin } });
  if (allowed.headers.get("access-control-allow-origin") !== pagesOrigin) {
    throw new Error("Pages origin did not receive the expected CORS header");
  }
  console.log("PASS CORS allow-list");

  const blocked = await fetch(`${baseUrl}/api/health`, { headers: { Origin: "https://not-allowed.example" } });
  if (blocked.status !== 403) throw new Error(`unexpected disallowed-origin status: ${blocked.status}`);
  console.log("PASS CORS rejects unknown origins");

  const { createTRPCProxyClient, httpBatchLink } = await import("@trpc/client");
  const superjson = (await import("superjson")).default;
  const client = createTRPCProxyClient({
    links: [httpBatchLink({ url: `${baseUrl}/api/trpc`, transformer: superjson })],
  });
  const result = await client.system.health.query({ timestamp: Date.now() });
  if (result?.ok !== true) throw new Error("tRPC system.health returned an unexpected payload");
  console.log("PASS tRPC system.health");
} catch (error) {
  console.error("FAIL Worker smoke test:", error instanceof Error ? error.message : String(error));
  if (output) console.error("Wrangler output:\n" + output);
  process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
  await Promise.race([new Promise(resolve => child.once("exit", resolve)), delay(3_000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
