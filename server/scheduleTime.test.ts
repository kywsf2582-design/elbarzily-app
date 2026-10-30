import { describe, expect, it } from "vitest";
import { cairoDayBounds, normalizeCairoWallTime } from "./scheduleTime";

describe("normalizeCairoWallTime", () => {
  it("uses Egypt's summer offset for an October venue time", () => {
    expect(normalizeCairoWallTime("2026-10-20T18:00:00")).toBe(
      "2026-10-20T18:00:00+03:00"
    );
  });

  it("uses Egypt's winter offset for a November venue time", () => {
    expect(normalizeCairoWallTime("2026-11-20T18:00:00Z")).toBe(
      "2026-11-20T18:00:00+02:00"
    );
  });

  it("leaves non-date text for the caller's date validator to reject", () => {
    expect(normalizeCairoWallTime("not-a-date")).toBe("not-a-date");
  });
  it("returns a Cairo calendar-day range with the summer UTC offset", () => {
    const bounds = cairoDayBounds("2026-10-20");
    expect(bounds?.start.toISOString()).toBe("2026-10-19T21:00:00.000Z");
    expect(bounds?.end.toISOString()).toBe("2026-10-20T21:00:00.000Z");
  });
  it("returns a Cairo calendar-day range with the winter UTC offset", () => {
    const bounds = cairoDayBounds("2026-11-20");
    expect(bounds?.start.toISOString()).toBe("2026-11-19T22:00:00.000Z");
    expect(bounds?.end.toISOString()).toBe("2026-11-20T22:00:00.000Z");
  });
  it("rejects invalid calendar dates", () => {
    expect(cairoDayBounds("2026-02-30")).toBeNull();
  });
});
