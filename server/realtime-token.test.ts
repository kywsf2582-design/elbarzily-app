import { describe, expect, it } from "vitest";
import { createRealtimeTicket, verifyRealtimeTicket } from "./realtime-token";

const secret = "test-only-realtime-secret";
const appId = "elbarzily-test";
const issuedAt = Date.UTC(2026, 0, 1);

describe("short-lived realtime tickets", () => {
  it("validates the signed user identity for the matching app", async () => {
    const ticket = await createRealtimeTicket(42, "player", secret, appId, issuedAt);
    await expect(verifyRealtimeTicket(ticket, secret, appId, issuedAt + 10_000)).resolves.toEqual({ userId: 42, role: "player" });
  });

  it("rejects a different app, altered signature, and expired ticket", async () => {
    const ticket = await createRealtimeTicket(42, "player", secret, appId, issuedAt);
    await expect(verifyRealtimeTicket(ticket, secret, "another-app", issuedAt + 10_000)).resolves.toBeNull();
    await expect(verifyRealtimeTicket(`${ticket.slice(0, -1)}x`, secret, appId, issuedAt + 10_000)).resolves.toBeNull();
    await expect(verifyRealtimeTicket(ticket, secret, appId, issuedAt + 91_000)).resolves.toBeNull();
  });
});
