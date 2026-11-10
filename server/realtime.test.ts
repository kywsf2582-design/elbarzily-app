import { describe, expect, it } from "vitest";
import { realtimeInvalidationForProcedures, successfulTrpcResponse } from "./realtime";

describe("realtime invalidation routing", () => {
  it("maps booking changes to the player, owner, and receipt views", () => {
    expect(realtimeInvalidationForProcedures(["bookings.create"])).toEqual({
      type: "invalidate",
      roots: ["bookings", "owner", "notifications"],
      adminAreas: ["receipts", "overview"],
    });
  });

  it("maps support replies without exposing message content", () => {
    expect(realtimeInvalidationForProcedures(["support.adminReply"])).toEqual({
      type: "invalidate",
      roots: ["support", "chat", "notifications"],
      adminAreas: ["support", "overview"],
    });
  });

  it("maps player chat sends to the live support conversation and admin inbox", () => {
    expect(realtimeInvalidationForProcedures(["chat.send"])).toEqual({
      type: "invalidate",
      roots: ["support", "chat", "notifications"],
      adminAreas: ["support", "overview"],
    });
  });

  it("merges domains in batched mutations without carrying input or response data", () => {
    const event = realtimeInvalidationForProcedures(["bookings.review", "subscriptions.request"]);
    expect(event?.roots).toEqual(["bookings", "owner", "notifications", "subscriptions"]);
    expect(event?.adminAreas).toEqual(["receipts", "overview", "subscriptions"]);
    expect(event).not.toHaveProperty("message");
    expect(event).not.toHaveProperty("bookingId");
  });
});

describe("tRPC response success detection", () => {
  it("accepts successful individual and batched responses", () => {
    expect(successfulTrpcResponse({ result: { data: { json: { success: true } } } })).toBe(true);
    expect(successfulTrpcResponse([{ result: { data: 1 } }, { result: { data: 2 } }])).toBe(true);
  });

  it("rejects errors, malformed bodies, and empty batches", () => {
    expect(successfulTrpcResponse({ error: { json: { message: "failed" } } })).toBe(false);
    expect(successfulTrpcResponse([{}])).toBe(false);
    expect(successfulTrpcResponse([])).toBe(false);
    expect(successfulTrpcResponse(null)).toBe(false);
  });
});
