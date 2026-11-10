import { describe, expect, it } from "vitest";
import { resolveApiWorkerOrigin } from "../functions/_shared/apiWorkerOrigin";

describe("resolveApiWorkerOrigin", () => {
  it("routes only the production Pages domain to the production Worker", () => {
    expect(resolveApiWorkerOrigin(new Request("https://elbarzily-production.pages.dev/api/trpc")))
      .toBe("https://elbarzily-api.a62165368.workers.dev");
    expect(resolveApiWorkerOrigin(new Request("https://abc123.elbarzily-production.pages.dev/api/trpc")))
      .toBeNull();
  });

  it("keeps the existing Staging Pages domain on its Staging Worker", () => {
    expect(resolveApiWorkerOrigin(new Request("https://elbarzily-neon-staging.pages.dev/api/trpc")))
      .toBe("https://elbarzily-api-staging.a62165368.workers.dev");
  });

  it("uses an explicitly configured HTTPS Worker origin", () => {
    expect(resolveApiWorkerOrigin(
      new Request("https://preview.elbarzily-production.pages.dev/api/trpc"),
      { API_WORKER_ORIGIN: "https://elbarzily-api.a62165368.workers.dev/" },
    )).toBe("https://elbarzily-api.a62165368.workers.dev");
  });

  it("fails closed for an invalid configured origin", () => {
    expect(resolveApiWorkerOrigin(
      new Request("https://elbarzily-production.pages.dev/api/trpc"),
      { API_WORKER_ORIGIN: "http://127.0.0.1:8787" },
    )).toBeNull();
  });

  it("never routes production Pages to Staging or staging Pages to Production", () => {
    expect(resolveApiWorkerOrigin(
      new Request("https://elbarzily-production.pages.dev/api/trpc"),
      { API_WORKER_ORIGIN: "https://elbarzily-api-staging.a62165368.workers.dev" },
    )).toBeNull();
    expect(resolveApiWorkerOrigin(
      new Request("https://elbarzily-neon-staging.pages.dev/api/trpc"),
      { API_WORKER_ORIGIN: "https://elbarzily-api.a62165368.workers.dev" },
    )).toBeNull();
  });
});
